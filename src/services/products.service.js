const pool = require('../config/db');

function normalizeAliasesInput(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((s) => (s === undefined || s === null ? '' : String(s).trim()))
      .filter((s) => s);
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);
}

function normalizeSkuCode(raw) {
  const s = raw === undefined || raw === null ? '' : String(raw).trim();
  return s || null;
}

async function listProducts({ brandId = null, search = '', page = 1, pageSize = 20 }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (brandId) {
    conditions.push(`p.brand_id = $${idx++}`);
    params.push(brandId);
  }

  if (search) {
    conditions.push(`(COALESCE(p.sku_code, '') ILIKE $${idx} OR p.name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM public.products p ${whereSql}`, params);
  const total = countRes.rows[0] ? countRes.rows[0].c : 0;

  const offset = (Math.max(page, 1) - 1) * pageSize;
  const rowsRes = await pool.query(
    `SELECT
       p.id, p.brand_id, p.name, p.sku_code, COALESCE(p.aliases, '{}') AS aliases, p.is_key, p.is_active,
       b.name AS brand_name, b.code AS brand_code, b.is_active AS brand_is_active
      FROM public.products p
      LEFT JOIN public.brands b ON b.id = p.brand_id
     ${whereSql}
     ORDER BY p.id DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, pageSize, offset]
  );

  return { items: rowsRes.rows || [], total };
}

async function getProductById(id) {
  const q = await pool.query(
    `SELECT
       p.id, p.brand_id, p.name, p.sku_code, COALESCE(p.aliases, '{}') AS aliases, p.is_key, p.is_active,
       b.name AS brand_name, b.code AS brand_code, b.is_active AS brand_is_active
      FROM public.products p
      LEFT JOIN public.brands b ON b.id = p.brand_id
     WHERE p.id = $1`,
    [id]
  );
  return q.rows[0] || null;
}

async function isSkuTaken(skuCode, excludeId = null) {
  const normalized = normalizeSkuCode(skuCode);
  if (!normalized) return false;
  const params = [normalized];
  let sql = 'SELECT id FROM public.products WHERE sku_code IS NOT NULL AND LOWER(sku_code) = LOWER($1)';
  if (excludeId) {
    sql += ' AND id <> $2';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';

  const q = await pool.query(sql, params);
  return !!(q.rows && q.rows.length);
}

async function isNameTaken({ brandId, name, excludeId = null }) {
  const params = [brandId, name];
  let sql = 'SELECT id FROM public.products WHERE brand_id = $1 AND LOWER(name) = LOWER($2)';
  if (excludeId) {
    sql += ' AND id <> $3';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  const q = await pool.query(sql, params);
  return !!(q.rows && q.rows.length);
}

async function createProduct({ brandId, skuCode = null, name, aliases = [], isKey = false, isActive = true }) {
  const normalizedAliases = normalizeAliasesInput(aliases);
  const normalizedSku = normalizeSkuCode(skuCode);
  const activeValue = isActive !== false;
  const keyValue = !!isKey;
  const q = await pool.query(
    `INSERT INTO public.products (brand_id, sku_code, name, aliases, is_key, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [brandId, normalizedSku, name, normalizedAliases, keyValue, activeValue]
  );
  return q.rows[0] || null;
}

async function updateProduct({ id, brandId, skuCode = null, name, aliases = [], isKey = false, isActive }) {
  const normalizedAliases = normalizeAliasesInput(aliases);
  const normalizedSku = normalizeSkuCode(skuCode);
  const activeValue = isActive !== false;
  const keyValue = !!isKey;
  const q = await pool.query(
    `UPDATE public.products
     SET brand_id=$1, sku_code=$2, name=$3, aliases=$4, is_key=$5, is_active=$6
     WHERE id=$7
     RETURNING *`,
    [brandId, normalizedSku, name, normalizedAliases, keyValue, activeValue, id]
  );
  return q.rows[0] || null;
}

async function toggleProductActive(id) {
  const q = await pool.query(
    'UPDATE public.products SET is_active = NOT is_active WHERE id=$1 RETURNING *',
    [id]
  );
  return q.rows[0] || null;
}

/**
 * Permanently deletes a product.
 * @param {number} id product id
 * @returns {Promise<boolean>} true when a row was removed
 */
async function deleteProduct(id) {
  const q = await pool.query('DELETE FROM public.products WHERE id=$1 RETURNING id', [id]);
  return q.rowCount > 0;
}

async function getProductsBySkuCodes(skuCodes = []) {
  if (!skuCodes || !skuCodes.length) return [];
  const normalized = Array.from(
    new Set(
      skuCodes
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => s)
    )
  );
  if (!normalized.length) return [];
  const q = await pool.query(
    'SELECT id, brand_id, name, sku_code FROM public.products WHERE sku_code IS NOT NULL AND LOWER(sku_code) = ANY($1::text[])',
    [normalized]
  );
  return q.rows || [];
}

async function upsertProducts(rows = []) {
  const result = { inserted: 0, updated: 0 };
  if (!rows.length) return result;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedRows = rows.map((r) => ({
      ...r,
      name: String(r.name || '').trim(),
      nameKey: String(r.name || '').trim().toLowerCase(),
      aliases: normalizeAliasesInput(r.aliases || []),
      skuCode: normalizeSkuCode(r.skuCode),
      isKey: r.isKey === true,
      isActive: r.isActive === false ? false : true,
    }));

    const skuList = normalizedRows
      .map((r) => (r.skuCode ? r.skuCode.toLowerCase() : null))
      .filter(Boolean);
    const existingBySku = new Map();
    if (skuList.length) {
      const existingSkuRows = await client.query(
        'SELECT id, brand_id, name, sku_code FROM public.products WHERE sku_code IS NOT NULL AND LOWER(sku_code) = ANY($1::text[])',
        [skuList]
      );
      (existingSkuRows.rows || []).forEach((r) => {
        existingBySku.set(String(r.sku_code).trim().toLowerCase(), r);
      });
    }

    const nameValuesSql =
      normalizedRows.length === 0
        ? ''
        : normalizedRows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const existingByName = new Map();
    if (nameValuesSql) {
      const existing = await client.query(
        `SELECT id, brand_id, name, sku_code
         FROM public.products
         WHERE (brand_id, LOWER(name)) IN (
           SELECT x.brand_id, LOWER(x.name) FROM (VALUES ${nameValuesSql}) AS x(brand_id, name)
         )`,
        normalizedRows.flatMap((r) => [r.brandId, r.name])
      );
      (existing.rows || []).forEach((r) => {
        existingByName.set(`${r.brand_id}|${String(r.name).trim().toLowerCase()}`, r);
      });
    }

    for (const row of normalizedRows) {
      const skuMatch = row.skuCode ? existingBySku.get(row.skuCode.toLowerCase()) : null;
      const nameKey = `${row.brandId}|${row.nameKey}`;
      const nameMatch = existingByName.get(nameKey);
      const target = skuMatch || nameMatch;

      if (target) {
        const oldSku = target.sku_code ? String(target.sku_code).trim().toLowerCase() : null;
        await client.query(
          `UPDATE public.products
           SET brand_id=$1, sku_code=$2, name=$3, aliases=$4, is_key=$5, is_active=$6
           WHERE id=$7`,
          [row.brandId, row.skuCode, row.name, row.aliases, row.isKey || false, row.isActive, target.id]
        );
        const updatedRecord = { id: target.id, brand_id: row.brandId, name: row.name, sku_code: row.skuCode };
        existingByName.set(nameKey, updatedRecord);
        if (row.skuCode) {
          const newKey = row.skuCode.toLowerCase();
          existingBySku.set(newKey, updatedRecord);
          if (oldSku && oldSku !== newKey) existingBySku.delete(oldSku);
        } else if (oldSku) {
          existingBySku.delete(oldSku);
        }
        result.updated += 1;
      } else {
        const inserted = await client.query(
          `INSERT INTO public.products (brand_id, sku_code, name, aliases, is_key, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, brand_id, name, sku_code`,
          [row.brandId, row.skuCode, row.name, row.aliases, row.isKey || false, row.isActive]
        );
        const insRow = inserted.rows && inserted.rows[0];
        if (insRow) {
          existingByName.set(nameKey, insRow);
          if (row.skuCode) existingBySku.set(row.skuCode.toLowerCase(), insRow);
        }
        result.inserted += 1;
      }
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listProducts,
  getProductById,
  isSkuTaken,
  isNameTaken,
  createProduct,
  updateProduct,
  toggleProductActive,
  getProductsBySkuCodes,
  upsertProducts,
  deleteProduct,
};
