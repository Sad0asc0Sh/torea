require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('--- Seed initial admin user ---');

    // 1) اگر اصلاً کاربری وجود دارد، دست نزن
    const cRes = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    const count = cRes.rows[0].c || 0;
    if (count > 0) {
      console.log('users table is not empty (' + count + ' rows). Skip seeding.');
      await pool.end();
      return;
    }

    // 2) ساخت پسورد هش‌شده برای admin-1234
    const passwordPlain = 'admin-1234';
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    // نکته: فعلاً org_node_id و manager_id را خالی می‌گذاریم.
    // بعداً خودت در فرم /register/edit لایه «شرکت» و بقیه را انتخاب می‌کنی.
    const insertRes = await pool.query(
      `
      INSERT INTO users
        (first_name, last_name, accounting_code, phone, telegram_id, username, password_hash,
         verification_code, status, role, active, org_node_id, manager_id)
      VALUES
        ($1,        $2,    $3,           $4,    $5,         $6,       $7,
         $8,               $9,         $10, $11,  $12,  $13)
      RETURNING id, username, status, role, active
      `,
      [
        'ادمین',          // first_name اولیه
        'سیستم',          // last_name اولیه
        null,             // accounting_code
        null,             // phone
        null,             // telegram_id
        'admin',          // username
        passwordHash,     // password_hash
        null,             // verification_code
        'seed_admin',     // status مخصوص ادمین اولیه
        'ADMIN',          // role
        false,            // active → غیرفعال تا اطلاعات تکمیل شود
        null,             // org_node_id (بعداً در فرم انتخاب می‌کنی)
        null              // manager_id (ادمین بالا دستی ندارد)
      ]
    );

    const admin = insertRes.rows[0];
    console.log('Initial admin inserted:');
    console.log(admin);
    console.log('Login with username="admin" and password="admin-1234"');
  } catch (err) {
    console.error('Seed initial admin error:', err);
    process.exitCode = 1;
  } finally {
    // بستن کانکشن
    try {
      await pool.end();
    } catch (e) {}
  }
})();
