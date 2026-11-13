'use strict';

const express = require('express');
const pool = require('../../../config/db');
const { parseNumberLoose } = require('../../../utils/number');

const DEBUG_CREDIT_POLICY = String(process.env.DEBUG_CREDIT_POLICY || '').toLowerCase() === 'true';


function normalizeUuidOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

const router = express.Router();

function toBool(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function toIntOrNull(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrNull(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeMsg(v) {
  if (!v) return null;
  const s = String(v);
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

function displayValue(raw, parsed) {
  if (raw === undefined || raw === null) return parsed;
  const rawStr = String(raw);
  if (rawStr.trim() === '') return '';
  return parsed ?? raw;
}

function validateNumberField(raw, parsed, label, { integer = false } = {}) {
  const rawStr = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!rawStr) return null; // optional field
  if (parsed === null) return `${label} باید عددی باشد.`;
  if (Number(parsed) < 0) return `${label} نمی‌تواند منفی باشد.`;
  if (integer && !Number.isInteger(Number(parsed))) return `${label} باید عدد صحیح باشد.`;
  return null;
}

async function fetchPolicyList() {
  const sql = `
    SELECT
      n.id AS org_node_id,
      n.title AS org_node_title,
      p.approver1_node_id,
      a1.title AS approver1_title,
      p.approver2_node_id,
      a2.title AS approver2_title,
      p.finance_required,
      p.finance_user_id,
      CONCAT_WS(' ', u.first_name, u.last_name) AS finance_user_name,
      u.username AS finance_username,
      p.max_open_invoices_per_user,
      p.max_open_amount_per_user,
      p.max_open_invoices_per_customer,
      p.max_open_amount_per_customer,
      p.max_invoice_amount
    FROM org_nodes n
    LEFT JOIN org_credit_policy p ON p.org_node_id = n.id
    LEFT JOIN org_nodes a1 ON a1.id = p.approver1_node_id
    LEFT JOIN org_nodes a2 ON a2.id = p.approver2_node_id
    LEFT JOIN users u ON u.id = p.finance_user_id
    ORDER BY n.id
  `;
  const q = await pool.query(sql);
  return q.rows || [];
}

async function fetchAllOrgNodes() {
  const q = await pool.query('SELECT id, title FROM org_nodes ORDER BY id');
  return q.rows || [];
}

async function fetchOrgNode(nodeId) {
  const q = await pool.query('SELECT id, title FROM org_nodes WHERE id = $1', [nodeId]);
  return q.rows[0] || null;
}

async function fetchPolicy(nodeId) {
  const q = await pool.query('SELECT * FROM org_credit_policy WHERE org_node_id=$1', [nodeId]);
  return q.rows[0] || null;
}

async function fetchUsers() {
  const q = await pool.query(
    "SELECT id, CONCAT_WS(' ', first_name, last_name) AS display_name FROM users ORDER BY id"
  );
  return q.rows || [];
}


router.get('/definitions/credit-policy', async (req, res) => {
  try {
    const policies = await fetchPolicyList();
    if (DEBUG_CREDIT_POLICY) {
      console.log('[credit-policy] list count=%d', Array.isArray(policies) ? policies.length : 0);
    }
    return res.render('admin/definitions/credit_policy', {
      user: req.session?.user || null,
      policies,
      error: safeMsg(req.query && req.query.err),
      warn: safeMsg(req.query && req.query.warn),
      info: safeMsg(req.query && req.query.ok),
    });
  } catch (err) {
    console.error('GET /admin/definitions/credit-policy error:', err);
    return res.render('admin/definitions/credit_policy', {
      user: req.session?.user || null,
      policies: [],
      error: 'خطا در خواندن سیاست‌های اعتباری.',
      warn: null,
      info: null,
    });
  }
});

router.get('/definitions/credit-policy/:nodeId', async (req, res) => {
  const nodeId = toIntOrNull(req.params?.nodeId);
  if (!nodeId) {
    return res.redirect('/admin/definitions/credit-policy?err=' + encodeURIComponent('شناسه نود نامعتبر است.'));
  }

  try {
    const [orgNodes, node, policy, users] = await Promise.all([
      fetchAllOrgNodes(),
      fetchOrgNode(nodeId),
      fetchPolicy(nodeId),
      fetchUsers(),
    ]);

    if (!node) {
      return res.redirect('/admin/definitions/credit-policy?err=' + encodeURIComponent('نود یافت نشد.'));
    }

    if (DEBUG_CREDIT_POLICY) {
      console.log('[credit-policy] GET form nodeId=%s policyFound=%s', nodeId, policy ? 'yes' : 'no');
    }

    return res.render('admin/definitions/credit_policy_form', {
      user: req.session?.user || null,
      node,
      orgNodes,
      policy: policy || { org_node_id: nodeId },
      users,
      error: null,
      warn: null,
      info: null,
    });
  } catch (err) {
    console.error('GET /admin/definitions/credit-policy/:nodeId error:', err);
    return res.redirect('/admin/definitions/credit-policy?err=' + encodeURIComponent('خطا در بارگذاری فرم.'));
  }
});

router.post('/definitions/credit-policy/:nodeId', async (req, res) => {
  const nodeId = toIntOrNull(req.params?.nodeId);
  if (!nodeId) {
    return res.redirect('/admin/definitions/credit-policy?err=' + encodeURIComponent('شناسه نود نامعتبر است.'));
  }

  let orgNodes = [];
  let node = null;
  let users = [];
  let existingPolicy = null;
  try {
    [orgNodes, node, users, existingPolicy] = await Promise.all([
      fetchAllOrgNodes(),
      fetchOrgNode(nodeId),
      fetchUsers(),
      fetchPolicy(nodeId),
    ]);
  } catch (err) {
    console.error('POST /admin/definitions/credit-policy/:nodeId preload error:', err);
  }

  if (!node) {
    return res.redirect('/admin/definitions/credit-policy?err=' + encodeURIComponent('نود یافت نشد.'));
  }

  if (DEBUG_CREDIT_POLICY) {
    console.log('[credit-policy] POST nodeId=%s body=%o', nodeId, req.body || {});
  }

  const approver1 = toIntOrNull(req.body?.approver1_node_id);
  const approver2 = toIntOrNull(req.body?.approver2_node_id);
  const financeRequired = toBool(req.body?.finance_required);
  const financeUserIdFinal = financeRequired ? normalizeUuidOrNull(req.body?.finance_user_id) : null;
  const maxOpenInvoicesPerUserRaw = req.body?.max_open_invoices_per_user;
  const maxOpenAmountPerUserRaw = req.body?.max_open_amount_per_user;
  const maxOpenInvoicesPerCustomerRaw = req.body?.max_open_invoices_per_customer;
  const maxOpenAmountPerCustomerRaw = req.body?.max_open_amount_per_customer;
  const maxInvoiceAmountRaw = req.body?.max_invoice_amount;
  const maxOpenInvoicesPerUser = toNumberOrNull(maxOpenInvoicesPerUserRaw);
  const maxOpenAmountPerUser = parseNumberLoose(maxOpenAmountPerUserRaw);
  const maxOpenInvoicesPerCustomer = toNumberOrNull(maxOpenInvoicesPerCustomerRaw);
  const maxOpenAmountPerCustomer = parseNumberLoose(maxOpenAmountPerCustomerRaw);
  const maxInvoiceAmount = parseNumberLoose(maxInvoiceAmountRaw);

  const policyForRender = {
    org_node_id: nodeId,
    approver1_node_id: approver1,
    approver2_node_id: approver2,
    finance_required: financeRequired,
    finance_user_id: financeUserIdFinal,
    max_open_invoices_per_user: displayValue(maxOpenInvoicesPerUserRaw, maxOpenInvoicesPerUser),
    max_open_amount_per_user: displayValue(maxOpenAmountPerUserRaw, maxOpenAmountPerUser),
    max_open_invoices_per_customer: displayValue(maxOpenInvoicesPerCustomerRaw, maxOpenInvoicesPerCustomer),
    max_open_amount_per_customer: displayValue(maxOpenAmountPerCustomerRaw, maxOpenAmountPerCustomer),
    max_invoice_amount: displayValue(maxInvoiceAmountRaw, maxInvoiceAmount),
    created_at: existingPolicy?.created_at || null,
    updated_at: existingPolicy?.updated_at || null,
  };

  if (!approver1 || !orgNodes.find((n) => Number(n.id) === Number(approver1))) {
    return res.render('admin/definitions/credit_policy_form', {
      user: req.session?.user || null,
      node,
      orgNodes,
      policy: policyForRender,
      users,
      error: 'تاییدکننده اول الزامی است.',
      warn: null,
      info: null,
    });
  }

  if (approver2 && approver2 === approver1) {
    return res.render('admin/definitions/credit_policy_form', {
      user: req.session?.user || null,
      node,
      orgNodes,
      policy: policyForRender,
      users,
      error: 'تاییدکننده دوم نمی‌تواند با تاییدکننده اول یکسان باشد.',
      warn: null,
      info: null,
    });
  }

  const financeUserValid =
    !financeRequired ||
    (financeUserIdFinal !== null &&
      financeUserIdFinal !== undefined &&
      users.find((u) => String(u.id) === String(financeUserIdFinal)));

  if (!financeUserValid) {
    return res.render('admin/definitions/credit_policy_form', {
      user: req.session?.user || null,
      node,
      orgNodes,
      policy: policyForRender,
      users,
      error: 'انتخاب کاربر مالی الزامی است.',
      warn: null,
      info: null,
    });
  }

  const numberError =
    validateNumberField(
      maxOpenInvoicesPerUserRaw,
      maxOpenInvoicesPerUser,
      'حداکثر فاکتور باز برای کاربر',
      { integer: true }
    ) ||
    validateNumberField(maxOpenAmountPerUserRaw, maxOpenAmountPerUser, 'حداکثر مبلغ باز برای کاربر') ||
    validateNumberField(
      maxOpenInvoicesPerCustomerRaw,
      maxOpenInvoicesPerCustomer,
      'حداکثر فاکتور باز برای مشتری',
      { integer: true }
    ) ||
    validateNumberField(maxOpenAmountPerCustomerRaw, maxOpenAmountPerCustomer, 'حداکثر مبلغ باز برای مشتری') ||
    validateNumberField(maxInvoiceAmountRaw, maxInvoiceAmount, 'حداکثر مبلغ هر فاکتور');

  if (numberError) {
    return res.render('admin/definitions/credit_policy_form', {
      user: req.session?.user || null,
      node,
      orgNodes,
      policy: policyForRender,
      users,
      error: numberError,
      warn: null,
      info: null,
    });
  }

  try {
    await pool.query(
      `INSERT INTO org_credit_policy (
         org_node_id,
         approver1_node_id,
         approver2_node_id,
         finance_required,
         finance_user_id,
         max_open_invoices_per_user,
         max_open_amount_per_user,
         max_open_invoices_per_customer,
         max_open_amount_per_customer,
         max_invoice_amount
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (org_node_id) DO UPDATE SET
          approver1_node_id=EXCLUDED.approver1_node_id,
          approver2_node_id=EXCLUDED.approver2_node_id,
          finance_required=EXCLUDED.finance_required,
          finance_user_id=EXCLUDED.finance_user_id,
          max_open_invoices_per_user=EXCLUDED.max_open_invoices_per_user,
          max_open_amount_per_user=EXCLUDED.max_open_amount_per_user,
          max_open_invoices_per_customer=EXCLUDED.max_open_invoices_per_customer,
          max_open_amount_per_customer=EXCLUDED.max_open_amount_per_customer,
          max_invoice_amount=EXCLUDED.max_invoice_amount,
          updated_at=NOW()
       `,
      [
        nodeId,
        approver1,
        approver2,
        financeRequired,
        financeUserIdFinal,
        maxOpenInvoicesPerUser,
        maxOpenAmountPerUser,
        maxOpenInvoicesPerCustomer,
        maxOpenAmountPerCustomer,
        maxInvoiceAmount,
      ]
    );

    return res.redirect('/admin/definitions/credit-policy?ok=' + encodeURIComponent('سیاست اعتباری ثبت شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/credit-policy/:nodeId error:', err);
    return res.render('admin/definitions/credit_policy_form', {
      user: req.session?.user || null,
      node,
      orgNodes,
      policy: policyForRender,
      users,
      error: 'خطا در ثبت سیاست اعتباری.',
      warn: null,
      info: null,
    });
  }
});

module.exports = router;
