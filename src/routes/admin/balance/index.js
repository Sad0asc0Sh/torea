'use strict';

const ExcelJS = require('exceljs');
const { Readable } = require('node:stream');
const multer = require('multer');
const express = require('express');
const pool = require('../../../config/db');
const { requireLogin } = require('../../../middlewares/auth');
const { enforceStatus } = require('../../../middlewares/guards');
const { parseMoneyLoose, toEnglishDigits } = require('../../../utils/number');
const { buildDisplayName } = require('../../../utils/names');
const debtsImportService = require('../../../services/debtsImport.service');

const router = express.Router();

const OPEN_FINAL_STATUSES = ['pending_controls', 'pending_approvals', 'approved'];
const SETTLEMENT_TYPES = ['cheque', 'cash', 'transfer', 'other'];
const columnCache = {};
const sellerCache = new Map();
const MAX_IMPORT_ERRORS = 50;
const MAX_PREVIEW_ROWS = 20;
const MAX_TEXT_LENGTH = 2000;
const MAX_INVOICE_NUMBER_LENGTH = 100;
const uploadDebtFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file && file.originalname) ? String(file.originalname).toLowerCase() : '';
    const mime = (file && file.mimetype) ? String(file.mimetype).toLowerCase() : '';
    const looksExcel = mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel';
    const looksCsv = ['text/csv', 'application/csv'].includes(mime);
    const hasValidExt = name.endsWith('.xlsx') || name.endsWith('.csv');
    if (!(hasValidExt || looksExcel || looksCsv)) {
      const err = new Error('Only .xlsx or .csv files are allowed.');
      err.code = 'INVALID_FILETYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

function toIntOrNull(v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrNull(v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeText(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.length > MAX_TEXT_LENGTH ? s.slice(0, MAX_TEXT_LENGTH) : s;
}

function toBool(v, defaultValue = false) {
  if (v === undefined || v === null) return !!defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(s)) return true;
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  return !!defaultValue;
}

function columnName(idx) {
  let n = idx;
  let name = '';
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.text !== undefined) return String(v.text);
    if (Array.isArray(v.richText)) return v.richText.map((x) => x.text || '').join('');
    if (v.result !== undefined) return String(v.result);
    if (v.hyperlink !== undefined && v.text !== undefined) return String(v.text);
  }
  return String(v);
}

function excelSerialToIso(serial) {
  if (!Number.isFinite(serial)) return null;
  const base = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(base.getTime() + serial * 86400000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeDueDate(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return excelSerialToIso(input);
  const s = toEnglishDigits(String(input).trim());
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return s;
  }
  const numeric = Number(s);
  if (Number.isFinite(numeric)) return excelSerialToIso(numeric);
  return null;
}

function detectHeaders(rows, hasHeader) {
  if (!rows.length) return { headers: [], dataRows: [] };
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (hasHeader) {
    const headerRow = rows[0] || [];
    const headers = [];
    for (let i = 0; i < maxCols; i += 1) {
      const raw = (headerRow[i] || '').toString().trim();
      headers.push(raw || columnName(i));
    }
    return { headers, dataRows: rows.slice(1) };
  }
  const headers = [];
  for (let i = 0; i < maxCols; i += 1) headers.push(columnName(i));
  return { headers, dataRows: rows };
}

function buildDefaultMapping(headers = []) {
  const normalized = headers.map((h) => String(h || '').trim().toLowerCase());
  const pick = (...keys) => {
    for (const k of keys) {
      const idx = normalized.findIndex((h) => h === k || h.includes(k));
      if (idx !== -1) return idx;
    }
    return '';
  };
  return {
    customer_code: pick('customer_code', 'کد مشتری', 'customer'),
    amount: pick('amount', 'invoice_amount', 'مبلغ', 'مبلغ بدهی'),
    due_date: pick('due_date', 'سررسید', 'تاریخ سررسید', 'date', 'تاریخ'),
    invoice_number: pick('invoice_number', 'شماره', 'شماره فاکتور', 'invoice'),
    customer_name: pick('customer_name', 'نام مشتری', 'name'),
    seller_id: pick('seller_id', 'seller'),
    seller_accounting_code: pick('seller_accounting_code', 'accounting_code', 'کد مالی فروشنده', 'کد حسابداری فروشنده', 'کد فروشنده'),
    seller_username: pick('seller_username', 'username', 'نام کاربری فروشنده'),
  };
}

async function parseDebtFile(file, hasHeader) {
  const uploadedName = file?.originalname ? String(file.originalname).toLowerCase() : '';
  const isCsv = uploadedName.endsWith('.csv');
  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    const stream = Readable.from([file.buffer]);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(file.buffer);
  }
  const sheet = workbook.worksheets?.[0] || workbook.getWorksheet(1);
  if (!sheet) throw new Error('NO_SHEET');

  const rows = [];
  sheet.eachRow((row) => {
    const values = [];
    const count = Math.max(row.cellCount || 0, (row.values ? row.values.length - 1 : 0));
    for (let c = 1; c <= count; c += 1) {
      const val = cellText(row.getCell(c).value).trim();
      values.push(val);
    }
    rows.push(values);
  });

  const { headers, dataRows } = detectHeaders(rows, hasHeader);
  const nonEmptyRows = dataRows.filter((r) => r.some((cell) => String(cell || '').trim() !== ''));
  return {
    headers,
    rows: nonEmptyRows,
    totalRows: nonEmptyRows.length,
    previewRows: nonEmptyRows.slice(0, MAX_PREVIEW_ROWS),
  };
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(days) ? days : 0));
  return d.toISOString().slice(0, 10);
}

async function hasColumn(table, column) {
  const cacheKey = `${table}:${column}`;
  if (cacheKey in columnCache) return columnCache[cacheKey];
  try {
    const res = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
      [table, column]
    );
    const exists = res.rows.length > 0;
    columnCache[cacheKey] = exists;
    return exists;
  } catch (e) {
    columnCache[cacheKey] = false;
    return false;
  }
}

async function findSellerByAccountingCode(code) {
  const normalized = safeText(code);
  if (!normalized) return null;
  const cacheKey = `acc:${normalized}`;
  if (sellerCache.has(cacheKey)) return sellerCache.get(cacheKey);
  const res = await pool.query(
    `SELECT id, username, accounting_code, first_name, last_name FROM users WHERE accounting_code = $1 LIMIT 1`,
    [normalized]
  );
  const row = res.rows?.[0] || null;
  sellerCache.set(cacheKey, row);
  return row;
}

async function findSellerByUsername(username) {
  const normalized = safeText(username);
  if (!normalized) return null;
  const cacheKey = `user:${normalized.toLowerCase()}`;
  if (sellerCache.has(cacheKey)) return sellerCache.get(cacheKey);
  const res = await pool.query(
    `SELECT id, username, accounting_code, first_name, last_name FROM users WHERE username = $1 LIMIT 1`,
    [normalized]
  );
  const row = res.rows?.[0] || null;
  sellerCache.set(cacheKey, row);
  return row;
}

async function loadUserBasic(userId) {
  if (!userId) return null;
  const q = await pool.query(
    'SELECT id, org_node_id, first_name, last_name, username, role FROM users WHERE id=$1',
    [userId]
  );
  return q.rows[0] || null;
}

async function fetchPolicy(orgNodeId) {
  const q = await pool.query('SELECT * FROM org_credit_policy WHERE org_node_id=$1', [orgNodeId]);
  return q.rows[0] || null;
}

async function computeSellerStats(sellerUserId, customerCode) {
  const q = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE final_status = ANY($2::text[])) AS open_count_all,
      COALESCE(SUM(invoice_amount) FILTER (WHERE final_status = ANY($2::text[])), 0)::numeric AS open_amount_all,
      COUNT(*) FILTER (WHERE customer_code = $1 AND final_status = ANY($2::text[])) AS open_count_customer,
      COALESCE(SUM(invoice_amount) FILTER (WHERE customer_code = $1 AND final_status = ANY($2::text[])), 0)::numeric AS open_amount_customer
    FROM credit_sale_requests
    WHERE seller_user_id = $3
    `,
    [customerCode, OPEN_FINAL_STATUSES, sellerUserId]
  );

  const r = q.rows[0] || {};
  return {
    open_count_all: Number(r.open_count_all || 0),
    open_amount_all: Number(r.open_amount_all || 0),
    open_count_customer: Number(r.open_count_customer || 0),
    open_amount_customer: Number(r.open_amount_customer || 0),
  };
}

function evaluateControls(policy, stats, newAmount) {
  if (!policy) return { ok: false, msg: 'سیاست اعتباری برای این سمت تعریف نشده است.' };
  const amount = Number(newAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, msg: 'مبلغ نامعتبر است.' };
  }
  const s = stats || {
    open_count_all: 0,
    open_amount_all: 0,
    open_count_customer: 0,
    open_amount_customer: 0,
  };

  const checks = [
    {
      limit: toNumberOrNull(policy.max_open_invoices_per_user),
      value: s.open_count_all + 1,
      msg: 'تعداد فاکتورهای باز فروشنده بیش از سقف مجاز است.',
    },
    {
      limit: toNumberOrNull(policy.max_open_amount_per_user),
      value: s.open_amount_all + amount,
      msg: 'مبلغ مانده فروشنده بیش از سقف مجاز است.',
    },
    {
      limit: toNumberOrNull(policy.max_open_invoices_per_customer),
      value: s.open_count_customer + 1,
      msg: 'تعداد فاکتورهای باز این مشتری بیش از سقف مجاز است.',
    },
    {
      limit: toNumberOrNull(policy.max_open_amount_per_customer),
      value: s.open_amount_customer + amount,
      msg: 'مبلغ باز این مشتری بیش از سقف مجاز است.',
    },
    {
      limit: toNumberOrNull(policy.max_invoice_amount),
      value: amount,
      msg: 'مبلغ این فاکتور بیش از سقف مجاز است.',
    },
  ];

  for (const c of checks) {
    if (c.limit !== null && c.value > Number(c.limit)) {
      return { ok: false, msg: c.msg };
    }
  }

  return { ok: true, msg: null };
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
  const approverNode = toIntOrNull(nodeId);
  if (!approverNode) return { status: 'skipped' };
  const sellerNode = toIntOrNull(sellerOrgNodeId);
  if (approverNode === sellerNode) return { status: 'skipped' };
  const user = await findActiveUserInNode(approverNode);
  if (!user) return { status: 'skipped' };
  return { status: 'pending' };
}

async function fetchSellers() {
  const q = await pool.query(
    "SELECT id, first_name, last_name, username, accounting_code FROM users WHERE active = TRUE ORDER BY id LIMIT 500"
  );
  return (q.rows || []).map((r) => ({
    id: r.id,
    name: buildDisplayName(r) || `کاربر ${r.id}`,
    accounting_code: r.accounting_code || null,
  }));
}

async function hasPendingSettlement(requestId) {
  const q = await pool.query(
    'SELECT id FROM credit_settlement_requests WHERE credit_request_id=$1 AND status = $2 LIMIT 1',
    [requestId, 'pending']
  );
  return q.rows.length > 0;
}

async function fetchApprovedSalesList() {
  const q = await pool.query(
    `
    SELECT id, customer_code, customer_name, invoice_amount
    FROM credit_sale_requests
    WHERE final_status = 'approved'
    ORDER BY id DESC
    LIMIT 200
    `
  );
  return q.rows || [];
}

function determineCreditDecisionRole(row, viewer, isSystemAdmin) {
  if (!row) return null;
  const orgNode = viewer?.org_node_id;
  const viewerId = viewer?.id;
  if (orgNode && orgNode === row.approver1_node_id && row.approver1_status === 'pending') {
    return 'approver1';
  }
  if (orgNode && orgNode === row.approver2_node_id && row.approver2_status === 'pending') {
    return 'approver2';
  }
  if (
    row.finance_required &&
    row.finance_user_id &&
    String(row.finance_user_id) === String(viewerId) &&
    row.finance_status === 'pending'
  ) {
    return 'finance';
  }
  if (isSystemAdmin) {
    if (row.approver1_status === 'pending') return 'approver1';
    if (row.approver2_status === 'pending') return 'approver2';
    if (row.finance_status === 'pending') return 'finance';
  }
  return null;
}

router.use(
  requireLogin,
  enforceStatus
);

async function renderBalanceDashboard(req, res) {
  const user = req.session?.user || null;
  try {
    const summaryQ = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE final_status = ANY($1::text[]))::int AS open_count,
        COALESCE(SUM(invoice_amount) FILTER (WHERE final_status = ANY($1::text[])), 0)::numeric AS open_amount,
        COUNT(*) FILTER (WHERE final_status = 'pending_approvals')::int AS pending_count
      FROM credit_sale_requests
      `,
      [OPEN_FINAL_STATUSES]
    );
    const summary = summaryQ.rows[0] || { open_count: 0, open_amount: 0, pending_count: 0 };
    const recentQ = await pool.query(
      `
      SELECT r.id, r.customer_code, r.customer_name, r.invoice_amount, r.final_status, r.due_date,
             s.first_name AS seller_first_name, s.last_name AS seller_last_name
      FROM credit_sale_requests r
      LEFT JOIN users s ON s.id = r.seller_user_id
      ORDER BY r.id DESC
      LIMIT 10
      `
    );
    return res.render('admin/balance/index', {
      user,
      summary,
      recent: recentQ.rows || [],
      error: null,
      info: safeText(req.query?.ok),
    });
  } catch (e) {
    console.error('[balance] dashboard error:', e);
    return res.render('admin/balance/index', {
      user,
      summary: { open_count: 0, open_amount: 0, pending_count: 0 },
      recent: [],
      error: 'خطا در بارگذاری مانده فروشنده.',
      info: null,
    });
  }
}

router.get('/balance', renderBalanceDashboard);
// Canonical stats endpoint currently mirrors the main balance dashboard.
router.get('/balance/stats', renderBalanceDashboard);

router.get('/balance/credit-requests', async (req, res) => {
  const user = req.session?.user || null;
  const sellerId = toIntOrNull(req.query?.seller_id);
  const status = safeText(req.query?.status || '') || 'open';
  const sellers = await fetchSellers().catch(() => []);

  const params = [];
  const where = [];
  if (sellerId) {
    params.push(sellerId);
    where.push(`r.seller_user_id = $${params.length}`);
  }
  if (status === 'open') {
    params.push(OPEN_FINAL_STATUSES);
    where.push(`r.final_status = ANY($${params.length}::text[])`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const q = await pool.query(
      `
      SELECT r.*,
             s.first_name AS seller_first_name, s.last_name AS seller_last_name,
             req.first_name AS requester_first_name, req.last_name AS requester_last_name
      FROM credit_sale_requests r
      LEFT JOIN users s ON s.id = r.seller_user_id
      LEFT JOIN users req ON req.id = r.requester_user_id
      ${whereSql}
      ORDER BY r.id DESC
      LIMIT 200
      `,
      params
    );

    return res.render('admin/balance/credit_requests_list', {
      user,
      sellers,
      items: q.rows || [],
      filters: { seller_id: sellerId || '', status },
      error: null,
      info: safeText(req.query?.ok),
    });
  } catch (e) {
    console.error('[balance] credit-requests list error:', e);
    return res.render('admin/balance/credit_requests_list', {
      user,
      sellers,
      items: [],
      filters: { seller_id: sellerId || '', status },
      error: 'خطا در بارگذاری لیست فروش اعتباری.',
      info: null,
    });
  }
});

async function renderCreditSaleForm(req, res) {
  const user = req.session?.user || null;
  const sellers = await fetchSellers().catch(() => []);
  return res.render('admin/balance/credit_request_form', {
    user,
    sellers,
    error: null,
    form: {
      seller_user_id: '',
      customer_code: '',
      customer_name: '',
      invoice_amount: '',
      due_days: 30,
      due_date: '',
      invoice_number: '',
      requester_note: '',
    },
  });
}

router.get('/balance/credit-requests/new', renderCreditSaleForm);
router.get('/balance/credit-sales/new', renderCreditSaleForm);

router.post('/balance/credit-requests', async (req, res) => {
  const user = req.session?.user || null;
  const sellers = await fetchSellers().catch(() => []);

  const sellerId = toIntOrNull(req.body?.seller_user_id);
  const customerCode = safeText(req.body?.customer_code);
  const customerName = safeText(req.body?.customer_name);
  const invoiceNumber = safeText(req.body?.invoice_number);
  const requesterNote = safeText(req.body?.requester_note);
  const amount = toNumberOrNull(req.body?.invoice_amount);
  const dueDaysRaw = toIntOrNull(req.body?.due_days);
  const dueDateInput = safeText(req.body?.due_date);

  const renderBack = (error) =>
    res.render('admin/balance/credit_request_form', {
      user,
      sellers,
      error,
      form: {
        seller_user_id: sellerId || '',
        customer_code: customerCode,
        customer_name: customerName,
        invoice_amount: req.body?.invoice_amount || '',
        due_days: req.body?.due_days || '',
        due_date: dueDateInput,
        invoice_number: invoiceNumber,
        requester_note: requesterNote,
      },
    });

  if (!sellerId || !customerCode || amount === null || amount <= 0) {
    return renderBack('اطلاعات ورودی ناقص است.');
  }

  let dueDate = null;
  if (dueDateInput) {
    const d = new Date(dueDateInput);
    if (Number.isNaN(d.getTime())) return renderBack('تاریخ سررسید نامعتبر است.');
    dueDate = d.toISOString().slice(0, 10);
  } else if (dueDaysRaw !== null && dueDaysRaw >= 0) {
    dueDate = addDays(dueDaysRaw);
  } else {
    return renderBack('مهلت یا تاریخ سررسید نامعتبر است.');
  }

  try {
    const seller = await loadUserBasic(sellerId);
    if (!seller || !seller.org_node_id) {
      return renderBack('اطلاعات فروشنده یافت نشد یا سمت ندارد.');
    }

    const policy = await fetchPolicy(seller.org_node_id);
    if (!policy) {
      return renderBack('برای این سمت سیاست اعتباری تعریف نشده است.');
    }
    if (policy.finance_required && !policy.finance_user_id) {
      return renderBack('کاربر مالی برای این سیاست مشخص نشده است.');
    }

    const stats = await computeSellerStats(sellerId, customerCode);
    const control = evaluateControls(policy, stats, amount);
    if (!control.ok) {
      return renderBack(control.msg || 'سقف‌های سیاست اعتباری رعایت نشده است.');
    }

    const approver1NodeId = policy.approver1_node_id;
    const approver2NodeId = policy.approver2_node_id;
    const financeRequired = !!policy.finance_required;
    const financeUserId = financeRequired ? policy.finance_user_id : null;

    const [approver1, approver2] = await Promise.all([
      resolveApprover(approver1NodeId, seller.org_node_id),
      resolveApprover(approver2NodeId, seller.org_node_id),
    ]);
    const financeStatus = financeRequired ? 'pending' : 'skipped';
    const anyPending = [approver1.status, approver2.status, financeStatus].includes('pending');
    const finalStatus = anyPending ? 'pending_approvals' : 'approved';

    await pool.query(
      `
      INSERT INTO credit_sale_requests (
        customer_code, customer_name, invoice_number, invoice_amount, due_days, due_date,
        seller_user_id, requester_user_id, requester_note,
        final_status, controls_passed, controls_error,
        approver1_node_id, approver2_node_id,
        finance_required, finance_user_id,
        approver1_status, approver2_status, finance_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      `,
      [
        customerCode,
        customerName || null,
        invoiceNumber || null,
        amount,
        dueDaysRaw,
        dueDate,
        sellerId,
        user?.id || null,
        requesterNote || null,
        finalStatus,
        true,
        null,
        approver1NodeId,
        approver2NodeId,
        financeRequired,
        financeUserId,
        approver1.status,
        approver2.status,
        financeStatus,
      ]
    );

    return res.redirect('/admin/balance/credit-requests?ok=' + encodeURIComponent('درخواست ثبت شد.'));
  } catch (e) {
    console.error('[balance] credit-requests insert error:', e);
    return renderBack('خطا در ثبت درخواست.');
  }
});

router.get('/balance/debts', async (req, res) => {
  const user = req.session?.user || null;
  const sellerId = toIntOrNull(req.query?.seller_id);
  const customerCode = safeText(req.query?.customer_code);
  const status = safeText(req.query?.status || '') || 'open';
  const sellers = await fetchSellers().catch(() => []);

  const params = [];
  const where = [];
  if (sellerId) {
    params.push(sellerId);
    where.push(`r.seller_user_id = $${params.length}`);
  }
  if (customerCode) {
    params.push(customerCode);
    where.push(`r.customer_code = $${params.length}`);
  }
  if (status === 'open') {
    params.push(OPEN_FINAL_STATUSES);
    where.push(`r.final_status = ANY($${params.length}::text[])`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const q = await pool.query(
      `
      SELECT r.id, r.customer_code, r.customer_name, r.invoice_amount, r.due_date, r.final_status,
             s.first_name AS seller_first_name, s.last_name AS seller_last_name
      FROM credit_sale_requests r
      LEFT JOIN users s ON s.id = r.seller_user_id
      ${whereSql}
      ORDER BY r.id DESC
      LIMIT 200
      `,
      params
    );

    const importResult = req.session?.debtImportResult || null;
    if (req.session) req.session.debtImportResult = null;

    return res.render('admin/balance/debts_list', {
      user,
      sellers,
      items: q.rows || [],
      filters: { seller_id: sellerId || '', customer_code: customerCode, status },
      error: null,
      info: safeText(req.query?.ok),
      importResult,
    });
  } catch (e) {
    console.error('[balance] debts list error:', e);
    return res.render('admin/balance/debts_list', {
      user,
      sellers,
      items: [],
      filters: { seller_id: sellerId || '', customer_code: customerCode, status },
      error: 'خطا در بارگذاری بدهی‌ها.',
      info: null,
      importResult: null,
    });
  }
});

router.get('/balance/debts/template.xlsx', async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ToInfinity';
  const ws = wb.addWorksheet('debts');
  const headers = ['کد مشتری', 'مبلغ بدهی', 'تاریخ سررسید', 'شماره فاکتور', 'نام مشتری', 'کد مالی فروشنده'];
  ws.addRow(headers);
  ws.addRow(['۱۲۳۴۵', '۱,۵۰۰,۰۰۰', '2025-01-15', 'فاکتور-۱۰۱', 'شرکت سپهر', 'AC-501']);
  ws.addRow(['۹۸۷۶۵', '۲,۳۰۰,۰۰۰', '2025-02-01', 'فاکتور-۱۰۲', 'فروشگاه آتیه', 'AC-502']);
  ws.getRow(1).font = { bold: true };
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, String(h).length + 2) }));
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="debts_template.xlsx"');
  res.status(200);
  return res.send(buf);
});

router.get('/balance/debts/import', (req, res) => {
  const user = req.session?.user || null;
  const importResult = req.session?.debtImportResult || null;
  if (req.session) req.session.debtImportResult = null;
  return res.render('admin/balance/debts_import', {
    user,
    error: safeText(req.query?.err),
    warn: safeText(req.query?.warn),
    info: safeText(req.query?.ok),
    importResult,
  });
});

router.post('/balance/debts/import', (req, res) => res.redirect('/admin/balance/debts/import'));

router.post('/balance/debts/import/preview', (req, res) => {
  uploadDebtFile.single('file')(req, res, async (multerErr) => {
    const user = req.session?.user || null;
    const hasHeader = toBool(req.body?.has_header, true);

    if (multerErr) {
      const msg = multerErr.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل نباید بیش از ۱۰ مگابایت باشد.' : 'خطا در بارگذاری فایل.';
      return res.redirect('/admin/balance/debts/import?err=' + encodeURIComponent(msg));
    }

    if (!req.file) {
      return res.redirect('/admin/balance/debts/import?err=' + encodeURIComponent('فایل الزامی است.'));
    }

    let parsed;
    try {
      parsed = await parseDebtFile(req.file, hasHeader);
    } catch (e) {
      console.error('[debt-import] parse error:', e);
      return res.redirect('/admin/balance/debts/import?err=' + encodeURIComponent('امکان خواندن فایل نیست.'));
    }

    const preview = {
      headers: parsed.headers,
      rows: parsed.rows,
      previewRows: parsed.previewRows,
      totalRows: parsed.totalRows,
      hasHeader,
      uploadedName: req.file.originalname,
      mapping: buildDefaultMapping(parsed.headers),
    };
    if (req.session) req.session.debtImportPreview = preview;

    return res.render('admin/balance/debts_import_map', {
      user,
      preview,
      error: null,
      mapping: preview.mapping,
    });
  });
});

router.post('/balance/debts/import/confirm', async (req, res) => {
  const user = req.session?.user || null;
  const preview = req.session?.debtImportPreview || null;
  if (!preview) {
    return res.redirect('/admin/balance/debts/import?warn=' + encodeURIComponent('ابتدا فایل را بارگذاری کنید.'));
  }

  const parseIndex = (name) => {
    const raw = req.body?.[`map_${name}`];
    if (raw === undefined || raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const mapping = {
    customer_code: parseIndex('customer_code'),
    amount: parseIndex('amount'),
    due_date: parseIndex('due_date'),
    invoice_number: parseIndex('invoice_number'),
    customer_name: parseIndex('customer_name'),
    seller_id: parseIndex('seller_id'),
    seller_accounting_code: parseIndex('seller_accounting_code'),
    seller_username: parseIndex('seller_username'),
  };

  if (mapping.customer_code === null || mapping.amount === null) {
    return res.render('admin/balance/debts_import_map', {
      user,
      preview,
      mapping,
      error: 'انتخاب ستون‌های کد مشتری و مبلغ الزامی است.',
    });
  }

  const importResult = { totalRows: preview.rows.length, inserted: 0, updated: 0, failed: 0, errors: [] };
  const validRows = [];
  const baseRowNumber = preview.hasHeader ? 2 : 1;
  let processedRows = 0;

  for (let idx = 0; idx < preview.rows.length; idx += 1) {
    const row = preview.rows[idx] || [];
    const excelRow = baseRowNumber + idx;
    const errs = [];
    processedRows += 1;

    const getVal = (i) => (i === null || i === undefined ? '' : row[i] || '');
    const customerCode = safeText(getVal(mapping.customer_code));
    if (!customerCode) errs.push('کد مشتری الزامی است.');

    const amountRaw = getVal(mapping.amount);
    const amountParsed = parseMoneyLoose(amountRaw);
    if (amountParsed === null || amountParsed < 0) errs.push('مبلغ نامعتبر است.');

    let dueDate = null;
    if (mapping.due_date !== null) {
      const rawDate = getVal(mapping.due_date);
      if (rawDate !== '') {
        const normalized = normalizeDueDate(rawDate);
        if (!normalized) errs.push('تاریخ سررسید نامعتبر است.');
        else dueDate = normalized;
      }
    }

    const invoiceNumber = safeText(getVal(mapping.invoice_number));
    if (invoiceNumber && invoiceNumber.length > MAX_INVOICE_NUMBER_LENGTH) errs.push('شماره فاکتور حداکثر ۱۰۰ کاراکتر باشد.');

    const customerName = safeText(getVal(mapping.customer_name));
    const sellerId = mapping.seller_id !== null ? toIntOrNull(getVal(mapping.seller_id)) : null;
    const sellerUsername = safeText(getVal(mapping.seller_username)) || null;
    const sellerAccountingCode = safeText(getVal(mapping.seller_accounting_code)) || null;

    let resolvedSellerId = sellerId;
    if (!resolvedSellerId) {
      if (sellerAccountingCode) {
        const seller = await findSellerByAccountingCode(sellerAccountingCode);
        if (seller) resolvedSellerId = seller.id;
        else errs.push(`فروشنده‌ای با کد مالی ${sellerAccountingCode} در ردیف ${excelRow} یافت نشد.`);
      } else if (sellerUsername) {
        const seller = await findSellerByUsername(sellerUsername);
        if (seller) resolvedSellerId = seller.id;
        else errs.push(`فروشنده‌ای با نام کاربری ${sellerUsername} در ردیف ${excelRow} یافت نشد.`);
      } else {
        errs.push(`کد مالی فروشنده در ردیف ${excelRow} وارد نشده است.`);
      }
    }

    if (errs.length) {
      importResult.errors.push({ row: excelRow, message: errs.join(' ') });
      if (importResult.errors.length >= MAX_IMPORT_ERRORS) break;
      continue;
    }

    validRows.push({
      customer_code: customerCode,
      customer_name: customerName || null,
      invoice_number: invoiceNumber || null,
      invoice_amount: amountParsed,
      due_date: dueDate,
      seller_user_id: resolvedSellerId,
      seller_username: sellerUsername,
      source: 'excel',
      final_status: 'approved',
    });
  }

  const errorCount = importResult.errors.length;
  if (processedRows !== preview.rows.length) {
    importResult.remainingRows = Math.max(0, preview.rows.length - processedRows);
  }
  importResult.totalRows = processedRows;
  if (!validRows.length) {
    importResult.failed = errorCount || importResult.totalRows;
    if (req.session) req.session.debtImportResult = importResult;
    return res.redirect('/admin/balance/debts/import?err=' + encodeURIComponent('ردیف معتبری یافت نشد.'));
  }

  try {
    const dbResult = await debtsImportService.importRows(validRows);
    importResult.inserted = dbResult.inserted || 0;
    importResult.updated = dbResult.updated || 0;
    importResult.failed = errorCount;
    if (req.session) req.session.debtImportResult = importResult;
    if (req.session) req.session.debtImportPreview = null;
    return res.redirect('/admin/balance/debts/import?ok=' + encodeURIComponent('ورود فایل انجام شد.'));
  } catch (err) {
    console.error('[debt-import] db error:', err);
    importResult.failed = importResult.totalRows;
    importResult.errors = [{ row: 0, message: 'خطا در ذخیره‌سازی داده‌ها.' }];
    if (req.session) req.session.debtImportResult = importResult;
    return res.redirect('/admin/balance/debts/import?err=' + encodeURIComponent('خطا در ثبت داده‌ها.'));
  }
});

router.get('/balance/settlement-requests', async (req, res) => {
  const user = req.session?.user || null;
  const status = safeText(req.query?.status || '') || 'pending';
  try {
    const params = [];
    const where = [];
    if (status && status !== 'all') {
      params.push(status);
      where.push(`csr.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const q = await pool.query(
      `
      SELECT csr.*, cr.customer_code, cr.customer_name, cr.invoice_amount
      FROM credit_settlement_requests csr
      JOIN credit_sale_requests cr ON cr.id = csr.credit_request_id
      ${whereSql}
      ORDER BY csr.id DESC
      LIMIT 200
      `,
      params
    );

    return res.render('admin/balance/settlement_requests_list', {
      user,
      items: q.rows || [],
      status,
      error: null,
      info: safeText(req.query?.ok),
    });
  } catch (e) {
    console.error('[balance] settlement list error:', e);
    return res.render('admin/balance/settlement_requests_list', {
      user,
      items: [],
      status,
      error: 'خطا در بارگذاری درخواست‌های تسویه.',
      info: null,
    });
  }
});

router.get('/balance/settlement-requests/new', async (req, res) => {
  const user = req.session?.user || null;
  try {
    const salesQ = await fetchApprovedSalesList();
    return res.render('admin/balance/settlement_request_form', {
      user,
      sales: salesQ || [],
      error: null,
      form: {
        credit_request_id: '',
        settlement_type: 'cash',
        settlement_ref_no: '',
        requester_note: '',
      },
    });
  } catch (e) {
    console.error('[balance] settlement new error:', e);
    const salesFallback = await fetchApprovedSalesList().catch(() => []);
    return res.render('admin/balance/settlement_request_form', {
      user,
      sales: salesFallback || [],
      error: 'خطا در بارگذاری فهرست فروش‌های تایید شده.',
      form: {
        credit_request_id: '',
        settlement_type: 'cash',
        settlement_ref_no: '',
        requester_note: '',
      },
    });
  }
});

router.post('/balance/settlement-requests', async (req, res) => {
  const user = req.session?.user || null;
  const creditRequestId = toIntOrNull(req.body?.credit_request_id);
  const settlementType = safeText(req.body?.settlement_type).toLowerCase();
  const settlementRefNo = safeText(req.body?.settlement_ref_no);
  const requesterNote = safeText(req.body?.requester_note);

  const salesList = await fetchApprovedSalesList().catch(() => []);

  const renderBack = (error) =>
    res.render('admin/balance/settlement_request_form', {
      user,
      sales: salesList || [],
      error,
      form: {
        credit_request_id: creditRequestId || '',
        settlement_type: settlementType || 'cash',
        settlement_ref_no: settlementRefNo,
        requester_note: requesterNote,
      },
    });

  if (!creditRequestId || !SETTLEMENT_TYPES.includes(settlementType)) {
    return renderBack('اطلاعات ورودی نامعتبر است.');
  }

  try {
    const saleQ = await pool.query(
      `SELECT id, final_status FROM credit_sale_requests WHERE id=$1 LIMIT 1`,
      [creditRequestId]
    );
    const sale = saleQ.rows[0];
    if (!sale || sale.final_status !== 'approved') {
      return renderBack('درخواست باید در وضعیت تایید شده باشد.');
    }

    if (await hasPendingSettlement(creditRequestId)) {
      return renderBack('یک تسویه در انتظار برای این درخواست وجود دارد.');
    }

    await pool.query(
      `
      INSERT INTO credit_settlement_requests (
        credit_request_id, settlement_type, settlement_ref_no, requester_note, status, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,'pending',$5)
      `,
      [creditRequestId, settlementType, settlementRefNo || null, requesterNote || null, user?.id || null]
    );

    return res.redirect('/admin/balance/settlement-requests?ok=' + encodeURIComponent('درخواست تسویه ثبت شد.'));
  } catch (e) {
    console.error('[balance] settlement insert error:', e);
    return renderBack('خطا در ثبت درخواست.');
  }
});

router.post('/balance/credit-requests/:id/decision', async (req, res) => {
  const user = req.session?.user || null;
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('شناسه نامعتبر است.'));

  const decisionRaw = safeText(req.body?.decision).toLowerCase();
  const decisionStatus =
    decisionRaw === 'approve' ? 'approved' : decisionRaw === 'reject' ? 'rejected' : null;
  const decisionNote = safeText(req.body?.decision_note);
  const decisionVoicePath = safeText(req.body?.decision_voice_path);
  if (!decisionStatus) {
    return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('تصمیم نامعتبر است.'));
  }
  if (decisionStatus === 'rejected' && !decisionNote) {
    return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('یادداشت تصمیم الزامی است.'));
  }

  try {
    const rq = await pool.query('SELECT * FROM credit_sale_requests WHERE id=$1', [id]);
    const row = rq.rows[0];
    if (!row || row.final_status !== 'pending_approvals') {
      return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('این درخواست در صف تأیید نیست.'));
    }

    const viewer = await loadUserBasic(user?.id);
    const isSystemAdmin = String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';
    const role = determineCreditDecisionRole(row, viewer, isSystemAdmin);

    if (!role) {
      return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('مجوز انجام این اقدام را ندارید.'));
    }

    const field =
      role === 'approver1' ? 'approver1_status' : role === 'approver2' ? 'approver2_status' : 'finance_status';

    const clauses = [
      `${field} = $2`,
      `final_status = CASE WHEN $2='rejected' THEN 'rejected' ELSE final_status END`,
    ];
    const params = [id, decisionStatus];
    let idx = params.length + 1;
    if (await hasColumn('credit_sale_requests', 'decision_note')) {
      clauses.push(`decision_note = $${idx++}`);
      params.push(decisionNote || null);
    }
    if (await hasColumn('credit_sale_requests', 'decision_voice_path')) {
      clauses.push(`decision_voice_path = $${idx++}`);
      params.push(decisionVoicePath || null);
    }
    if (await hasColumn('credit_sale_requests', 'decided_at')) {
      clauses.push('decided_at = NOW()');
    }

    const updateRes = await pool.query(
      `
      UPDATE credit_sale_requests
      SET ${clauses.join(', ')}
      WHERE id=$1 AND final_status = 'pending_approvals' AND ${field} = 'pending'
      RETURNING *
      `,
      params
    );
    if (updateRes.rowCount === 0) {
      return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('پیش از این تصمیم‌گیری شده است.'));
    }

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

    return res.redirect('/admin/inbox?category=credit&ok=' + encodeURIComponent('تصمیم ثبت شد.'));
  } catch (e) {
    console.error('[balance] credit decision error:', e);
    return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('خطا در ثبت تصمیم.'));
  }
});

router.post('/balance/settlement-requests/:id/decision', async (req, res) => {
  const user = req.session?.user || null;
  const id = toIntOrNull(req.params?.id);
  if (!id) return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('شناسه نامعتبر است.'));

  const decisionRaw = safeText(req.body?.decision).toLowerCase();
  const decisionStatus =
    decisionRaw === 'approve' ? 'approved' : decisionRaw === 'reject' ? 'rejected' : null;
  const decisionNote = safeText(req.body?.decision_note);
  const decisionVoicePath = safeText(req.body?.decision_voice_path);
  if (!decisionStatus) {
    return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('تصمیم نامعتبر است.'));
  }
  if (decisionStatus === 'rejected' && !decisionNote) {
    return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('یادداشت تصمیم الزامی است.'));
  }

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
    if (!row || row.status !== 'pending') {
      return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('این تسویه در صف نیست.'));
    }

    const isFinance = String(row.finance_user_id || '') === String(user?.id || '');
    const isSystemAdmin = String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';
    if (!isFinance && !isSystemAdmin) {
      return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('مجوز این اقدام را ندارید.'));
    }

    await pool.query(
      `
      UPDATE credit_settlement_requests
      SET status=$2,
          decision_note=$3,
          decision_voice_path=$4,
          decided_at = NOW()
      WHERE id=$1 AND status='pending'
      `,
      [id, decisionStatus, decisionNote || null, decisionVoicePath || null]
    );

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

    return res.redirect('/admin/inbox?category=credit&ok=' + encodeURIComponent('تصمیم ثبت شد.'));
  } catch (e) {
    console.error('[balance] settlement decision error:', e);
    return res.redirect('/admin/inbox?category=credit&warn=' + encodeURIComponent('خطا در ثبت تصمیم.'));
  }
});

module.exports = router;
