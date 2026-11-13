require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('--- RESET users & org_nodes and SEED base company/admin ---');

    // همه چیز در یک تراکنش
    await pool.query('BEGIN');

    // ۱) خالی کردن جدول کاربران
    console.log('Deleting all rows from users...');
    await pool.query('DELETE FROM users');

    // ۲) خالی کردن جدول سلسله مراتب
    console.log('Deleting all rows from org_nodes...');
    await pool.query('DELETE FROM org_nodes');

    // ۳) ساخت لایه ۱: شرکت (در منطق ما لایه صفرِ مخفی)
    console.log('Inserting level-1 company root node...');
    const companyRes = await pool.query(
      `INSERT INTO org_nodes (title, parent_id, level)
       VALUES ($1, $2, $3)
       RETURNING id, level`,
      ['شرکت', null, 1]
    );
    const companyId = companyRes.rows[0].id;

    // ۴) ساخت لایه ۲: ادمین شرکت (زیرمجموعه شرکت)
    console.log('Inserting level-2 admin-company node under company...');
    const adminNodeRes = await pool.query(
      `INSERT INTO org_nodes (title, parent_id, level)
       VALUES ($1, $2, $3)
       RETURNING id, level`,
      ['ادمین شرکت', companyId, 2]
    );
    const adminNodeId = adminNodeRes.rows[0].id;

    // ۵) ساخت یوزر ادمین اولیه
    console.log('Hashing password for admin user...');
    const passwordPlain = 'admin-1234';
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    console.log('Inserting initial admin user...');
    const userRes = await pool.query(
      `INSERT INTO users
        (first_name, last_name, accounting_code, phone, telegram_id, username, password_hash,
         verification_code, status, role, active, org_node_id, manager_id)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13)
       RETURNING id, username, status, role, active, org_node_id`,
      [
        'ادمین',          // first_name
        'سیستم',          // last_name
        null,             // accounting_code
        null,             // phone
        null,             // telegram_id
        'admin',          // username
        passwordHash,     // password_hash
        null,             // verification_code
        'seed_admin',     // status مخصوص ادمین اولیه
        'ADMIN',          // role
        false,            // active → بعداً در /register/edit تکمیل و فعال می‌شود
        adminNodeId,      // org_node_id → "ادمین شرکت"
        null              // manager_id → مدیر بالاسری کاربری ندارد (شرکت لایه‌ی بالاست، نه یوزر)
      ]
    );

    await pool.query('COMMIT');

    console.log('--- DONE ---');
    console.log('Company node id   :', companyId);
    console.log('Admin org node id:', adminNodeId);
    console.log('Admin user       :', userRes.rows[0]);
    console.log('Login with username="admin" and password="admin-1234"');
  } catch (err) {
    console.error('reset/seed error:', err);
    try { await pool.query('ROLLBACK'); } catch (e) {}
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch (e) {}
  }
})();
