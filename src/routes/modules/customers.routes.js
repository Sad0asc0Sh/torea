const express = require('express');
const pool = require('../../config/db');
const { requireLogin } = require('../../middlewares/auth');

const router = express.Router();

const PAGE_SIZE = 50;

// لیست مشتری‌ها با keyset pagination
// /customers?after=123  => آیتم‌های قدیمی‌تر از id=123
router.get('/customers', requireLogin, async (req, res) => {
  const basePath = req.baseUrl || '';
  const afterRaw = req.query.after;
  const after = afterRaw ? parseInt(afterRaw, 10) : null;

  try {
    const params = [];
    let where = '';
    if (Number.isInteger(after) && after > 0) {
      params.push(after);
      where = `WHERE c.id < $1`;
    }

    // یک مورد اضافه می‌گیریم تا بفهمیم صفحه بعدی داریم یا نه
    params.push(PAGE_SIZE + 1);

    const q = await pool.query(
      `
      SELECT c.*, ct.name AS type_name
      FROM customers c
      LEFT JOIN customer_types ct ON ct.id = c.type_id
      ${where}
      ORDER BY c.id DESC
      LIMIT $${params.length}
      `,
      params
    );

    const rows = q.rows;
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const nextAfter = hasMore ? items[items.length - 1].id : null;

    const types = await pool.query(`SELECT id, name FROM customer_types ORDER BY name ASC`);

    return res.render('shared/customers', {
      items,
      types: types.rows,
      error: null,
      pageSize: PAGE_SIZE,
      after: after || null,
      nextAfter,
      hasMore,
      basePath,
    });
  } catch (e) {
    console.error('GET /customers error:', e);
    return res.render('shared/customers', {
      items: [],
      types: [],
      error: 'خطا در خواندن مشتری‌ها',
      pageSize: PAGE_SIZE,
      after: after || null,
      nextAfter: null,
      hasMore: false,
      basePath,
    });
  }
});

router.post('/customers', requireLogin, async (req, res) => {
  const basePath = req.baseUrl || '';
  const { code, name, type_id, address_text } = req.body;
  if (!code || !name) return res.redirect(`${basePath}/customers`);

  try {
    await pool.query(
      `INSERT INTO customers (code, name, type_id, address_text)
       VALUES ($1,$2,$3,$4)`,
      [code.trim(), name.trim(), type_id ? parseInt(type_id, 10) : null, address_text || null]
    );
    return res.redirect(`${basePath}/customers`);
  } catch (e) {
    console.error('POST /customers error:', e);
    return res.redirect(`${basePath}/customers`);
  }
});

module.exports = router;
