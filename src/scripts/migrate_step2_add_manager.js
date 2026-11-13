require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('--- Step 2 (fixed): DB migration add/normalize manager_id as UUID ---');
  try {
    await pool.query('SELECT 1');
    console.log('DB connection OK');

    // 1) اگر قبلاً constraint اشتباه یا ناقص ساخته شده، حذفش کن
    console.log('Dropping old manager_id constraint if exists...');
    await pool.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_manager_id_fkey
    `);
    console.log('Old constraint (if any) dropped.');

    // 2) ستون manager_id را اگر نیست بساز، اگر هست نوعش را به uuid تبدیل کن
    console.log('Ensuring manager_id column of type uuid...');
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'manager_id'
        ) THEN
          ALTER TABLE users
            ADD COLUMN manager_id uuid;
        ELSE
          -- اگر قبلاً ساخته شده ولی نوعش چیز دیگری است، به uuid تبدیل می‌کنیم
          ALTER TABLE users
            ALTER COLUMN manager_id TYPE uuid
            USING manager_id::uuid;
        END IF;
      END$$;
    `);
    console.log('manager_id column is now uuid.');

    // 3) اضافه کردن Foreign Key درست
    console.log('Adding foreign key constraint users_manager_id_fkey...');
    await pool.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_manager_id_fkey
      FOREIGN KEY (manager_id)
      REFERENCES users(id)
      ON DELETE SET NULL
    `);
    console.log('Foreign key constraint added.');

    console.log('Migration step 2 completed successfully ✅');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
    console.log('DB connection closed.');
  }
}

run();
