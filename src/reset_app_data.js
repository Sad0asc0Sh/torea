require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

/**
 * این اسکریپت:
 * 1) تمام رکوردهای جدول users را حذف می‌کند
 * 2) نودهای پایه org_nodes ("شرکت" و "ادمین شرکت") را اگر نبود بسازد
 * 3) یک ادمین اولیه با active=true و status='pending_telegram' ایجاد می‌کند
 */

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('--- HARD RESET USERS + SEED ADMIN ---');
    await pool.query('BEGIN');

    console.log('🧹 پاک کردن همه رکوردهای جدول users ...');
    await pool.query('DELETE FROM users');

    console.log('🏢 اطمینان از وجود نود "شرکت" در org_nodes ...');
    let result = await pool.query(
      `SELECT id FROM org_nodes WHERE title = $1 ORDER BY id ASC LIMIT 1`,
      ['شرکت']
    );
    let companyId;
    if (result.rows.length > 0) {
      companyId = result.rows[0].id;
      console.log('   نود "شرکت" موجود است. id =', companyId);
    } else {
      result = await pool.query(
        `INSERT INTO org_nodes (title, parent_id, level)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ['شرکت', null, 1]
      );
      companyId = result.rows[0].id;
      console.log('   نود "شرکت" ساخته شد. id =', companyId);
    }

    console.log('👤 اطمینان از وجود نود "ادمین شرکت" زیر "شرکت" ...');
    result = await pool.query(
      `SELECT id FROM org_nodes WHERE title = $1 AND parent_id = $2 ORDER BY id ASC LIMIT 1`,
      ['ادمین شرکت', companyId]
    );
    let adminNodeId;
    if (result.rows.length > 0) {
      adminNodeId = result.rows[0].id;
      console.log('   نود "ادمین شرکت" موجود است. id =', adminNodeId);
    } else {
      result = await pool.query(
        `INSERT INTO org_nodes (title, parent_id, level)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ['ادمین شرکت', companyId, 2]
      );
      adminNodeId = result.rows[0].id;
      console.log('   نود "ادمین شرکت" ساخته شد. id =', adminNodeId);
    }

    console.log('🔐 ساخت ادمین اولیه با username="admin" و password="admin-1234" ...');
    const passwordHash = await bcrypt.hash('admin-1234', 10);

    const userRes = await pool.query(
      `INSERT INTO users
        (username, password_hash, first_name, last_name, accounting_code, phone, role,
         active, status, org_node_id, manager_id, created_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING id, username, role, active, status, org_node_id`,
      [
        'admin',               // username
        passwordHash,          // password_hash
        'ادمین',               // first_name
        'سیستم',               // last_name
        null,                  // accounting_code
        null,                  // phone
        'ADMIN',               // role
        true,                  // active (ادمین از ابتدا فعال است)
        'pending_telegram',    // status (تلگرام در انتظار احراز)
        adminNodeId,           // org_node_id
        null                   // manager_id
      ]
    );

    await pool.query('COMMIT');

    console.log('✅ DONE HARD RESET USERS + SEED ADMIN');
    console.log('Company node id   :', companyId);
    console.log('Admin org node id:', adminNodeId);
    console.log('Admin user       :', userRes.rows[0]);
    console.log('Login with username="admin" and password="admin-1234"');
  } catch (err) {
    console.error('reset_app_data error:', err);
    try { await pool.query('ROLLBACK'); } catch (e) {}
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch (e) {}
  }
})();
