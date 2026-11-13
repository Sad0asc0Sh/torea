'use strict';

const express = require('express');
const pool = require('../../../config/db');
const { requireLogin } = require('../../../middlewares/auth');
const { toIntOrNull } = require('../../../utils/validators');

const router = express.Router();

const getBasePath = (req) => req.baseUrl || '';

const SETTLEMENT_TYPES = ['cheque', 'cash', 'transfer', 'other'];
const OPEN_FINAL_STATUSES = ['pending_controls', 'pending_approvals', 'approved'];

function toText(value) {
  return String(value || '').trim();
}

function isSystemAdmin(user) {
  return String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';
}

async function loadSale(requestId) {
  const q = await pool.query(
    `
    SELECT id, customer_code, customer_name, invoice_amount, due_date,
           final_status, finance_user_id, seller_user_id, requester_user_id
    FROM credit_sale_requests
    WHERE id=$1
    `,
    [requestId]
  );
  return q.rows[0] || null;
}

async function hasPendingSettlement(requestId) {
  const q = await pool.query(
    'SELECT id FROM credit_settlement_requests WHERE credit_request_id=$1 AND status = ANY($2::text[]) LIMIT 1',
    [requestId, ['pending']]
  );
  return q.rows.length > 0;
}

router.get('/tools/credit-settlement/new', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const creditRequestId = toIntOrNull(req.query?.credit_request_id);
  if (!creditRequestId) return res.status(400).send('bad request');

  try {
    const sale = await loadSale(creditRequestId);
    if (!sale) return res.status(404).send('not found');
    
    // catalogAccess middleware already handles access control
    // Business logic: Check if user has relationship to initiate settlement
    const uid = Number(user?.id);
    const isAdmin = isSystemAdmin(user);
    const hasBusinessRelationship = isAdmin || (
      uid === Number(sale.seller_user_id) ||
      uid === Number(sale.requester_user_id) ||
      uid === Number(sale.finance_user_id)
    );
    
    if (!hasBusinessRelationship) {
      return res.status(403).send('شما مجاز به ایجاد تسویه برای این درخواست نیستید');
    }

    return res.render('shared/credit_settlement_new', {
      user,
      sale,
      error: sale.final_status !== 'approved' ? 'درخواست باید تایید شده باشد.' : null,
      form: {
        settlement_type: 'cash',
        settlement_ref_no: '',
        notes: '',
        credit_request_id: creditRequestId,
      },
      basePath,
    });
  } catch (err) {
    console.error('GET /tools/credit-settlement/new error:', err);
    return res.status(500).send('internal error');
  }
});

router.post('/tools/credit-settlement', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const creditRequestId = toIntOrNull(req.body?.credit_request_id);
  const settlementType = toText(req.body?.settlement_type).toLowerCase();
  const settlementRefNo = toText(req.body?.settlement_ref_no);
  const notes = toText(req.body?.notes || '');

  if (!creditRequestId || !SETTLEMENT_TYPES.includes(settlementType) || !settlementRefNo) {
    return res.render('shared/credit_settlement_new', {
      user,
      sale: null,
      error: 'اطلاعات ورودی نامعتبر است.',
      form: req.body || {},
      basePath,
    });
  }

  try {
    const sale = await loadSale(creditRequestId);
    if (!sale) {
      return res.render('shared/credit_settlement_new', {
        user,
        sale: null,
        error: 'درخواست فروش اعتباری یافت نشد.',
        form: req.body || {},
        basePath,
      });
    }

    // catalogAccess middleware already handles access control
    // Business logic: Check if user has relationship to initiate settlement
    const uid = Number(user?.id);
    const isAdmin = isSystemAdmin(user);
    const hasBusinessRelationship = isAdmin || (
      uid === Number(sale.seller_user_id) ||
      uid === Number(sale.requester_user_id) ||
      uid === Number(sale.finance_user_id)
    );
    
    if (!hasBusinessRelationship) {
      return res.status(403).send('شما مجاز به ایجاد تسویه برای این درخواست نیستید');
    }

    if (sale.final_status !== 'approved') {
      return res.render('shared/credit_settlement_new', {
        user,
        sale,
        error: 'درخواست باید در وضعیت تایید شده باشد.',
        form: { ...(req.body || {}), credit_request_id: creditRequestId },
        basePath,
      });
    }

    if (await hasPendingSettlement(creditRequestId)) {
      return res.render('shared/credit_settlement_new', {
        user,
        sale,
        error: 'یک تسویه در انتظار برای این درخواست وجود دارد.',
        form: { ...(req.body || {}), credit_request_id: creditRequestId },
        basePath,
      });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO credit_settlement_requests (
        credit_request_id, settlement_type, settlement_ref_no, notes, status, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,'pending',$5)
      RETURNING id
      `,
      [creditRequestId, settlementType, settlementRefNo, notes || null, user?.id || null]
    );

    const newId = insertRes.rows[0]?.id;
    if (!newId) throw new Error('insert failed');

    return res.redirect(`${basePath}/tools/credit-sale/${creditRequestId}`);
  } catch (err) {
    console.error('POST /tools/credit-settlement error:', err);
    return res.render('shared/credit_settlement_new', {
      user,
      sale: null,
      error: 'خطا در ثبت تسویه.',
      form: req.body || {},
      basePath,
    });
  }
});

router.get('/tools/credit-settlement/inbox', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  if (!user?.id) return res.redirect('/login');

  try {
    const q = await pool.query(
      `
      SELECT csr.id AS settlement_id, csr.credit_request_id, csr.settlement_type, csr.settlement_ref_no,
             csr.notes, csr.status, csr.created_at,
             cr.customer_code, cr.customer_name, cr.invoice_amount
      FROM credit_settlement_requests csr
      JOIN credit_sale_requests cr ON cr.id = csr.credit_request_id
      WHERE cr.finance_user_id = $1 AND csr.status = 'pending'
      ORDER BY csr.id DESC
      LIMIT 100
      `,
      [user.id]
    );

    return res.render('shared/credit_settlement_inbox', {
      user,
      items: q.rows || [],
      basePath,
    });
  } catch (err) {
    console.error('GET /tools/credit-settlement/inbox error:', err);
    return res.render('shared/credit_settlement_inbox', {
      user,
      items: [],
      error: 'خطا در خواندن لیست',
      basePath,
    });
  }
});

router.post('/tools/credit-settlement/:id/decide', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.status(404).send('not found');

  const decisionRaw = String(req.body?.decision || '').toLowerCase();
  const decisionStatus = decisionRaw === 'approve' ? 'approved' : decisionRaw === 'reject' ? 'rejected' : null;
  if (!decisionStatus) return res.status(400).send('bad request');

  try {
    const q = await pool.query(
      `
      SELECT csr.*, cr.finance_user_id, cr.final_status
      FROM credit_settlement_requests csr
      JOIN credit_sale_requests cr ON cr.id = csr.credit_request_id
      WHERE csr.id = $1
      `,
      [id]
    );
    const row = q.rows[0];
    if (!row) return res.status(404).send('not found');

    // Business logic: Only the finance user can decide on settlements
    if (Number(row.finance_user_id) !== Number(user?.id)) {
      return res.status(403).send('فقط کاربر مالی می‌تواند در مورد این تسویه تصمیم بگیرد');
    }

    if (row.status !== 'pending') return res.status(409).send('already decided');

    if (decisionStatus === 'approved' && row.final_status !== 'approved') {
      return res.status(409).send('invalid status');
    }

    const upd = await pool.query(
      'UPDATE credit_settlement_requests SET status=$2, decided_at = NOW() WHERE id=$1 AND status=$3',
      [id, decisionStatus, 'pending']
    );
    if (upd.rowCount === 0) return res.status(409).send('already handled');

    if (decisionStatus === 'approved') {
      await pool.query(
        `
        UPDATE credit_sale_requests
        SET final_status='settled', settled_at = NOW()
        WHERE id = $1 AND final_status = ANY($2::text[])
        `,
        [row.credit_request_id, OPEN_FINAL_STATUSES]
      );
    }

    return res.redirect(`${basePath}/tools/credit-settlement/inbox`);
  } catch (err) {
    console.error('POST /tools/credit-settlement/:id/decide error:', err);
    return res.status(500).send('internal error');
  }
});

module.exports = router;
