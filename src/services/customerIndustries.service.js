const pool = require('../config/db');
const { normalizeTitle, toBool } = require('../utils/validators');

function normalizeSortOrder(raw) {
  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

async function listCustomerIndustries() {
  const q = await pool.query(
    `SELECT id, title, is_active, sort_order, created_at
     FROM public.customer_industries
     ORDER BY sort_order ASC, id DESC`
  );
  return q.rows || [];
}

async function listActiveCustomerIndustries() {
  const q = await pool.query(
    `SELECT id, title
       FROM public.customer_industries
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id DESC`
  );
  return q.rows || [];
}

async function getCustomerIndustryById(id) {
  const q = await pool.query(
    `SELECT id, title, is_active, sort_order, created_at
       FROM public.customer_industries
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return q.rows[0] || null;
}

async function isTitleTaken(title, excludeId = null) {
  const params = [title];
  let sql = 'SELECT id FROM public.customer_industries WHERE LOWER(title) = LOWER($1)';
  if (excludeId) {
    sql += ' AND id <> $2';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';

  const q = await pool.query(sql, params);
  return !!(q.rows && q.rows.length);
}

async function createCustomerIndustry({ title, sortOrder = 0, isActive = true }) {
  const q = await pool.query(
    `INSERT INTO public.customer_industries (title, sort_order, is_active, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, title, is_active, sort_order, created_at`,
    [normalizeTitle(title), normalizeSortOrder(sortOrder), toBool(isActive, true)]
  );
  return q.rows[0] || null;
}

async function updateCustomerIndustry({ id, title, sortOrder = 0, isActive = true }) {
  const q = await pool.query(
    `UPDATE public.customer_industries
        SET title = $1,
            sort_order = $2,
            is_active = $3
      WHERE id = $4
      RETURNING id, title, is_active, sort_order, created_at`,
    [normalizeTitle(title), normalizeSortOrder(sortOrder), toBool(isActive, true), id]
  );
  return q.rows[0] || null;
}

async function toggleCustomerIndustryActive(id) {
  const q = await pool.query(
    `UPDATE public.customer_industries
        SET is_active = NOT is_active
      WHERE id = $1
      RETURNING id, title, is_active, sort_order, created_at`,
    [id]
  );
  return q.rows[0] || null;
}

module.exports = {
  listCustomerIndustries,
  listActiveCustomerIndustries,
  getCustomerIndustryById,
  isTitleTaken,
  createCustomerIndustry,
  updateCustomerIndustry,
  toggleCustomerIndustryActive,
};
