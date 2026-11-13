const pool = require('../config/db');

function normalizeCodeValue(raw) {
  const c = raw === undefined || raw === null ? '' : String(raw).trim();
  return c ? c : null;
}

function normalizeManagerUserId(raw) {
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  return v ? v : null;
}

async function listBrandsWithCounts() {
  const sql = `
    SELECT
      brands.id,
      brands.name,
      brands.code,
      brands.is_active,
      brands.created_at,
      brands.updated_at,
      brands.manager_user_id,
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(manager.first_name, ''), ' ', COALESCE(manager.last_name, ''))), ''),
        manager.username
      ) AS manager_display_name,
      COUNT(DISTINCT products.id)::int AS products_count,
      COUNT(DISTINCT team_brands.team_id)::int AS teams_count
    FROM public.brands AS brands
      LEFT JOIN public.products AS products ON products.brand_id = brands.id
      LEFT JOIN public.team_brands AS team_brands ON team_brands.brand_id = brands.id
      LEFT JOIN public.users AS manager ON manager.id = brands.manager_user_id
    GROUP BY brands.id, brands.manager_user_id, manager.first_name, manager.last_name, manager.username
    ORDER BY brands.id DESC
  `;
  const q = await pool.query(sql);
  return q.rows || [];
}

async function getBrandById(id) {
  const q = await pool.query('SELECT * FROM public.brands WHERE id = $1', [id]);
  return q.rows[0] || null;
}

async function isNameTaken(name, excludeId = null) {
  const params = [name];
  let sql = 'SELECT id FROM public.brands WHERE LOWER(name) = LOWER($1)';
  if (excludeId) {
    sql += ' AND id <> $2';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';

  const q = await pool.query(sql, params);
  return !!(q.rows && q.rows.length);
}

async function isCodeTaken(code, excludeId = null) {
  const normalized = normalizeCodeValue(code);
  if (!normalized) return false;
  const params = [normalized];
  let sql = 'SELECT id FROM public.brands WHERE code IS NOT NULL AND LOWER(code) = LOWER($1)';
  if (excludeId) {
    sql += ' AND id <> $2';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';

  const q = await pool.query(sql, params);
  return !!(q.rows && q.rows.length);
}

async function createBrand({ name, code = null, isActive = true, managerUserId = null }) {
  const normalizedCode = normalizeCodeValue(code);
  const managerId = normalizeManagerUserId(managerUserId);
  const q = await pool.query(
    'INSERT INTO public.brands (name, code, is_active, manager_user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *',
    [name, normalizedCode, isActive, managerId]
  );
  return q.rows[0] || null;
}

async function updateBrand({ id, name, code = null, isActive, managerUserId = null }) {
  const normalizedCode = normalizeCodeValue(code);
  const managerId = normalizeManagerUserId(managerUserId);
  const q = await pool.query(
    'UPDATE public.brands SET name=$1, code=$2, is_active=$3, manager_user_id=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
    [name, normalizedCode, isActive, managerId, id]
  );
  return q.rows[0] || null;
}

async function toggleBrandActive(id) {
  const q = await pool.query(
    'UPDATE public.brands SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1 RETURNING *',
    [id]
  );
  return q.rows[0] || null;
}

async function countProducts(brandId) {
  const q = await pool.query('SELECT COUNT(*)::int AS c FROM public.products WHERE brand_id = $1', [brandId]);
  return q.rows[0] ? q.rows[0].c : 0;
}

async function listActiveBrands() {
  const q = await pool.query('SELECT id, name, is_active FROM public.brands WHERE is_active = true ORDER BY name');
  return q.rows || [];
}

async function listAllBrandsSimple() {
  const q = await pool.query('SELECT id, name, code, is_active, manager_user_id FROM public.brands ORDER BY name');
  return q.rows || [];
}

async function listActiveUsersForManagerSelect() {
  const q = await pool.query(
    `SELECT
       id,
       username,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''),
          username
        ) AS display_name
     FROM public.users
     WHERE active = true
     ORDER BY display_name, username`
  );
  return q.rows || [];
}

module.exports = {
  listBrandsWithCounts,
  getBrandById,
  isNameTaken,
  isCodeTaken,
  createBrand,
  updateBrand,
  toggleBrandActive,
  countProducts,
  listActiveBrands,
  listAllBrandsSimple,
  listActiveUsersForManagerSelect,
};
