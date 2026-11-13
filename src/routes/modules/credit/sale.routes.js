'use strict';

const express = require('express');
const pool = require('../../../config/db');
const { requireLogin } = require('../../../middlewares/auth');
const { toNumberOrNull, toIntOrNull } = require('../../../utils/validators');

const router = express.Router();
const PG_UNIQUE_VIOLATION = '23505';

const OPEN_STATUSES = ['pending_controls', 'pending_approvals', 'approved'];

function normalizeNodeId(value) {
  return toNumberOrNull(value);
}

const getBasePath = (req) => req.baseUrl || '';

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(days) ? days : 0));
  return d.toISOString().slice(0, 10);
}

async function loadUserBasic(userId) {
  const q = await pool.query(
    'SELECT id, org_node_id, first_name, last_name, username FROM users WHERE id=$1',
    [userId]
  );
  return q.rows[0] || null;
}

async function fetchPolicy(orgNodeId) {
  const q = await pool.query('SELECT * FROM org_credit_policy WHERE org_node_id=$1', [orgNodeId]);
  return q.rows[0] || null;
}

async function hasOpenCustomerRequest(customerCode) {
  const q = await pool.query(
    `SELECT id FROM credit_sale_requests
     WHERE customer_code=$1 AND final_status = ANY($2::text[])
     LIMIT 1`,
    [customerCode, OPEN_STATUSES]
  );
  return q.rows.length > 0;
}

async function computeSellerStats(sellerUserId, customerCode) {
  const q = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE final_status = ANY($2::text[])) AS open_count_all,
      COALESCE(SUM(invoice_amount) FILTER (WHERE final_status = ANY($2::text[])), 0)::numeric AS open_amount_all,
      COUNT(*) FILTER (WHERE customer_code = $1 AND final_status = ANY($2::text[])) AS open_count_customer,
      COALESCE(SUM(invoice_amount) FILTER (WHERE customer_code = $1 AND final_status = ANY($2::text[])), 0)::numeric AS open_amount_customer,
      COALESCE(SUM(GREATEST(0, (CURRENT_DATE - due_date))) FILTER (WHERE due_date < CURRENT_DATE AND final_status = ANY($2::text[])), 0)::int AS overdue_days_sum
    FROM credit_sale_requests
    WHERE seller_user_id = $3
    `,
    [customerCode, OPEN_STATUSES, sellerUserId]
  );

  const r = q.rows[0] || {};
  return {
    open_count_all: Number(r.open_count_all || 0),
    open_amount_all: Number(r.open_amount_all || 0),
    open_count_customer: Number(r.open_count_customer || 0),
    open_amount_customer: Number(r.open_amount_customer || 0),
    overdue_days_sum: Number(r.overdue_days_sum || 0),
  };
}

function evaluateControls(policy, stats, newAmount) {
  if (!policy) return { ok: false, msg: 'سیاست اعتباری برای این سمت تعریف نشده است.' };
  if (toNumberOrNull(policy.max_open_invoices_per_user) !== null) {
    const limit = Number(policy.max_open_invoices_per_user);
    if (stats.open_count_all + 1 > limit) {
      return { ok: false, msg: 'تعداد فاکتورهای باز فروشنده بیش از سقف مجاز است.' };
    }
  }

  if (toNumberOrNull(policy.max_open_amount_per_user) !== null) {
    const limit = Number(policy.max_open_amount_per_user);
    if (stats.open_amount_all + newAmount > limit) {
      return { ok: false, msg: 'مبلغ مانده فروشنده بیش از سقف مجاز است.' };
    }
  }

  if (toNumberOrNull(policy.max_open_invoices_per_customer) !== null) {
    const limit = Number(policy.max_open_invoices_per_customer);
    if (stats.open_count_customer + 1 > limit) {
      return { ok: false, msg: 'تعداد فاکتورهای باز این مشتری بیش از سقف مجاز است.' };
    }
  }

  if (toNumberOrNull(policy.max_open_amount_per_customer) !== null) {
    const limit = Number(policy.max_open_amount_per_customer);
    if (stats.open_amount_customer + newAmount > limit) {
      return { ok: false, msg: 'مبلغ باز این مشتری بیش از سقف مجاز است.' };
    }
  }

  if (toNumberOrNull(policy.max_invoice_amount) !== null) {
    const limit = Number(policy.max_invoice_amount);
    if (newAmount > limit) {
      return { ok: false, msg: 'مبلغ این فاکتور بیش از سقف مجاز است.' };
    }
  }

  return { ok: true, msg: null };
}

function buildApprovalText(reqRow, stats) {
  const lastName = reqRow?.seller_last_name || reqRow?.requester_last_name || 'کاربر';
  const x = stats.open_count_all || 0;
  const y = stats.open_amount_all || 0;
  const z = stats.overdue_days_sum || 0;
  return `کاربر ${lastName} درخواست فروش اعتباری دارد وضعیت کنونی تعداد ${x} و مبلغ ${y} تومان مانده از قبل و تاخیر در وصول ${z} روز`;
}

async function findActiveUserInNode(nodeId) {
  if (!nodeId) return null;
  const q = await pool.query(
    'SELECT id FROM users WHERE org_node_id=$1 AND active = TRUE ORDER BY id LIMIT 1',
    [nodeId]
  );
  return q.rows[0] || null;
}

async function resolveApprover(nodeId, sellerOrgNodeId) {
  const approverNode = normalizeNodeId(nodeId);
  if (!approverNode) return { status: 'skipped' };
  const sellerNode = normalizeNodeId(sellerOrgNodeId);
  if (approverNode === sellerNode) {
    return { status: 'skipped' };
  }
  // Keep extensible shape for future user binding (approver_user_id)
  const user = await findActiveUserInNode(approverNode);
  if (!user) return { status: 'skipped' };
  return { status: 'pending' };
}

function buildCreditSaleForm(body, sellerId, dueDaysValue) {
  return { ...(body || {}), seller_user_id: sellerId || '', due_days: dueDaysValue };
}

router.get('/tools/credit-sale/new', requireLogin, (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  return res.render('shared/credit_sale_new', {
    user,
    error: null,
    form: {
      seller_user_id: user?.id || '',
      customer_code: '',
      customer_name: '',
      invoice_amount: '',
      due_days: 30,
    },
    basePath,
  });
});

router.post('/tools/credit-sale', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const sellerId = toIntOrNull(req.body?.seller_user_id) || (user ? user.id : null);
  const requesterId = user?.id || null;
  const customerCode = String(req.body?.customer_code || '').trim();
  const customerName = String(req.body?.customer_name || '').trim();
  const amount = toNumberOrNull(req.body?.invoice_amount);
  const dueDaysRaw = toIntOrNull(req.body?.due_days);
  // Zero days allowed (cash/today), negative values rejected.
  const dueDays = dueDaysRaw !== null && dueDaysRaw >= 0 ? dueDaysRaw : null;

  if (dueDays === null) {
    return res.render('shared/credit_sale_new', {
      user,
      error: 'مهلت پرداخت نامعتبر است.',
      form: buildCreditSaleForm(req.body, sellerId, dueDaysRaw || ''),
      basePath,
    });
  }

  if (!sellerId || !requesterId || !customerCode || !customerName || amount === null) {
    return res.render('shared/credit_sale_new', {
      user,
      error: 'اطلاعات ورودی ناقص است.',
      form: buildCreditSaleForm(req.body, sellerId, dueDaysRaw || ''),
      basePath,
    });
  }

  const dueDate = addDays(dueDays);

  try {
    if (await hasOpenCustomerRequest(customerCode)) {
      return res.render('shared/credit_sale_new', {
        user,
        error: 'برای این مشتری یک درخواست باز وجود دارد.',
        form: buildCreditSaleForm(req.body, sellerId, dueDays),
        basePath,
      });
    }

    const seller = await loadUserBasic(sellerId);
    if (!seller || !seller.org_node_id) {
      return res.render('shared/credit_sale_new', {
        user,
        error: 'اطلاعات فروشنده یافت نشد.',
        form: buildCreditSaleForm(req.body, sellerId, dueDays),
        basePath,
      });
    }

    const policy = await fetchPolicy(seller.org_node_id);
    if (!policy) {
      return res.render('shared/credit_sale_new', {
        user,
        error: 'برای این سمت سیاست اعتباری تعریف نشده است.',
        form: buildCreditSaleForm(req.body, sellerId, dueDays),
        basePath,
      });
    }
    if (policy.finance_required && !policy.finance_user_id) {
      return res.render('shared/credit_sale_new', {
        user,
        error: 'کاربر مالی برای این سیاست مشخص نشده است.',
        form: buildCreditSaleForm(req.body, sellerId, dueDays),
        basePath,
      });
    }

    const stats = await computeSellerStats(sellerId, customerCode);
    const control = evaluateControls(policy, stats, amount);

    const controlsPassed = !!control.ok;
    const approver1NodeId = controlsPassed ? policy.approver1_node_id : null;
    const approver2NodeId = controlsPassed ? policy.approver2_node_id : null;
    const financeRequired = controlsPassed ? !!policy.finance_required : false;
    const financeUserId = controlsPassed && policy.finance_required ? policy.finance_user_id : null;

    const [approver1, approver2] = controlsPassed
      ? await Promise.all([
          resolveApprover(approver1NodeId, seller.org_node_id),
          resolveApprover(approver2NodeId, seller.org_node_id),
        ])
      : [{ status: 'skipped' }, { status: 'skipped' }];
    const financeStatus = financeRequired ? 'pending' : 'skipped';

    const anyPending = [approver1.status, approver2.status, financeStatus].includes('pending');
    const finalStatus = controlsPassed ? (anyPending ? 'pending_approvals' : 'approved') : 'rejected';

    const insertRes = await pool.query(
      `INSERT INTO credit_sale_requests (
         customer_code, customer_name, invoice_amount, due_days, due_date,
         seller_user_id, requester_user_id,
         final_status, controls_passed, controls_error,
         approver1_node_id, approver2_node_id,
         finance_required, finance_user_id,
         approver1_status, approver2_status, finance_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING id`,
      [
        customerCode,
        customerName,
        amount,
        dueDays,
        dueDate,
        sellerId,
        requesterId,
        finalStatus,
        controlsPassed,
        control.msg,
        approver1NodeId,
        approver2NodeId,
        financeRequired,
        financeUserId,
        approver1.status,
        approver2.status,
        financeStatus,
      ]
    );

    const newId = insertRes.rows[0]?.id;
    return res.redirect(`${basePath}/tools/credit-sale/${newId || ''}`);
  } catch (err) {
    if (err && err.code === PG_UNIQUE_VIOLATION) {
      return res.render('shared/credit_sale_new', {
        user,
        error: 'برای این مشتری یک درخواست باز وجود دارد.',
        form: buildCreditSaleForm(req.body, sellerId, dueDaysRaw || ''),
        basePath,
      });
    }
    console.error('POST /tools/credit-sale error:', err);
    return res.render('shared/credit_sale_new', {
      user,
      error: 'خطا در ثبت درخواست.',
      form: buildCreditSaleForm(req.body, sellerId, dueDaysRaw || ''),
      basePath,
    });
  }
});

router.get('/tools/credit-sale/my-open', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  if (!user?.id) return res.redirect('/login');

  try {
    const q = await pool.query(
      `
      SELECT id, customer_code, customer_name, invoice_amount, due_date,
             final_status, approver1_status, approver2_status, finance_status
      FROM credit_sale_requests
      WHERE seller_user_id=$1 AND final_status = ANY($2::text[])
      ORDER BY id DESC
      LIMIT 100
      `,
      [user.id, OPEN_STATUSES]
    );

    return res.render('shared/credit_sale_list', {
      user,
      items: q.rows || [],
      basePath,
    });
  } catch (err) {
    console.error('GET /tools/credit-sale/my-open error:', err);
    return res.render('shared/credit_sale_list', {
      user,
      items: [],
      error: 'خطا در خواندن لیست',
      basePath,
    });
  }
});

router.get('/tools/credit-sale/:id', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.status(404).send('not found');

  try {
    const rq = await pool.query(
      `
      SELECT r.*,
             s.first_name AS seller_first_name, s.last_name AS seller_last_name,
             req.first_name AS requester_first_name, req.last_name AS requester_last_name,
             a1.title AS approver1_title, a2.title AS approver2_title
      FROM credit_sale_requests r
      LEFT JOIN users s ON s.id = r.seller_user_id
      LEFT JOIN users req ON req.id = r.requester_user_id
      LEFT JOIN org_nodes a1 ON a1.id = r.approver1_node_id
      LEFT JOIN org_nodes a2 ON a2.id = r.approver2_node_id
      WHERE r.id=$1
      `,
      [id]
    );
    const row = rq.rows[0];
    if (!row) return res.status(404).send('not found');

    // catalogAccess middleware already handles access control
    // Business logic: Check if user has relationship to this sale request
    const viewer = await loadUserBasic(user?.id);
    const isSystemAdmin = String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';
    const hasBusinessRelationship =
      viewer && row && (
        Number(viewer.id) === Number(row.seller_user_id) ||
        Number(viewer.id) === Number(row.requester_user_id) ||
        Number(viewer.id) === Number(row.finance_user_id) ||
        (viewer.org_node_id && viewer.org_node_id === row.approver1_node_id) ||
        (viewer.org_node_id && viewer.org_node_id === row.approver2_node_id)
      );
    
    if (!isSystemAdmin && !hasBusinessRelationship) {
      return res.status(403).send('شما به این درخواست دسترسی ندارید');
    }

    const stats = await computeSellerStats(row.seller_user_id, row.customer_code);
    const approvalText = buildApprovalText(row, stats);

    const canApprove =
      (viewer?.org_node_id && viewer.org_node_id === row.approver1_node_id && row.approver1_status === 'pending') ||
      (viewer?.org_node_id && viewer.org_node_id === row.approver2_node_id && row.approver2_status === 'pending') ||
      (row.finance_required && row.finance_user_id && Number(row.finance_user_id) === Number(viewer?.id) && row.finance_status === 'pending');

    return res.render('user/credit_sale_detail', {
      user,
      item: row,
      approvalText,
      stats,
      canApprove,
      basePath,
    });
  } catch (err) {
    console.error('GET /tools/credit-sale/:id error:', err);
    return res.status(500).send('internal error');
  }
});

router.post('/tools/credit-sale/:id/approve', requireLogin, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.status(404).send('not found');

  const decisionRaw = String(req.body?.decision || '').toLowerCase();
  const decisionStatus = decisionRaw === 'approve' ? 'approved' : decisionRaw === 'reject' ? 'rejected' : null;
  if (!decisionStatus) return res.status(400).send('bad request');

  try {
    const rq = await pool.query('SELECT * FROM credit_sale_requests WHERE id=$1', [id]);
    const row = rq.rows[0];
    if (!row) return res.status(404).send('not found');
    if (row.final_status !== 'pending_approvals') return res.status(409).send('already decided');

    const viewer = await loadUserBasic(user?.id);
    const role =
      viewer?.org_node_id && viewer.org_node_id === row.approver1_node_id ? 'approver1' :
      viewer?.org_node_id && viewer.org_node_id === row.approver2_node_id ? 'approver2' :
      (row.finance_required && Number(row.finance_user_id) === Number(viewer?.id)) ? 'finance' :
      null;

    // Business logic: user must have an approval role for this request
    if (!role) {
      return res.status(403).send('شما مجاز به تصمیم‌گیری در این درخواست نیستید');
    }

    const field = role === 'approver1' ? 'approver1_status'
      : role === 'approver2' ? 'approver2_status'
      : 'finance_status';

    let updateRes = null;
    if (field === 'approver1_status') {
      updateRes = await pool.query(
        `
        UPDATE credit_sale_requests
        SET approver1_status = $2,
            final_status = CASE WHEN $2='rejected' THEN 'rejected' ELSE final_status END
        WHERE id=$1 AND final_status = 'pending_approvals' AND approver1_status = 'pending'
        RETURNING *
        `,
        [id, decisionStatus]
      );
    } else if (field === 'approver2_status') {
      updateRes = await pool.query(
        `
        UPDATE credit_sale_requests
        SET approver2_status = $2,
            final_status = CASE WHEN $2='rejected' THEN 'rejected' ELSE final_status END
        WHERE id=$1 AND final_status = 'pending_approvals' AND approver2_status = 'pending'
        RETURNING *
        `,
        [id, decisionStatus]
      );
    } else {
      updateRes = await pool.query(
        `
        UPDATE credit_sale_requests
        SET finance_status = $2,
            final_status = CASE WHEN $2='rejected' THEN 'rejected' ELSE final_status END
        WHERE id=$1 AND final_status = 'pending_approvals' AND finance_status = 'pending'
        RETURNING *
        `,
        [id, decisionStatus]
      );
    }

    if (updateRes.rowCount === 0) return res.status(409).send('already handled');

    if (decisionStatus === 'approved') {
      await pool.query(
        `
        UPDATE credit_sale_requests
        SET final_status = 'approved'
        WHERE id=$1
          AND final_status = 'pending_approvals'
          AND approver1_status IN ('approved','skipped')
          AND (approver2_node_id IS NULL OR approver2_status IN ('approved','skipped'))
          AND (finance_required = false OR finance_status IN ('approved','skipped'))
        `,
        [id]
      );
    }

    return res.redirect(`${basePath}/tools/credit-sale/${id}`);
  } catch (err) {
    console.error('POST /tools/credit-sale/:id/approve error:', err);
    return res.status(500).send('internal error');
  }
});

module.exports = router;
