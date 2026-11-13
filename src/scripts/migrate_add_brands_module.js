require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('--- Migrating brands module (table + indexes) ---');
  try {
    await pool.query('SELECT 1');
    console.log('DB connection OK');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        code text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    console.log('Ensured brands table exists.');

    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS code text`);
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW()`);
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW()`);
    await pool.query(`ALTER TABLE brands ALTER COLUMN created_at SET DEFAULT NOW()`);
    await pool.query(`ALTER TABLE brands ALTER COLUMN updated_at SET DEFAULT NOW()`);
    await pool.query(`ALTER TABLE brands ALTER COLUMN is_active SET DEFAULT true`);
    await pool.query(`UPDATE brands SET updated_at = NOW() WHERE updated_at IS NULL`);
    console.log('Aligned brands columns and defaults.');

    // Add partial unique index on code (case-insensitive, non-empty) when data allows
    const dupCode = await pool.query(`
      SELECT lower(btrim(code)) AS code_key, COUNT(*) AS c
      FROM brands
      WHERE code IS NOT NULL AND btrim(code) <> ''
      GROUP BY lower(btrim(code))
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (dupCode.rows.length) {
      console.warn('Skipped unique index on brands.code due to duplicate codes. Please resolve duplicates and rerun.');
    } else {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS brands_code_unique_ci
        ON brands (LOWER(code))
        WHERE code IS NOT NULL AND btrim(code) <> ''
      `);
      console.log('Unique index on brands.code ensured.');
    }
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
    console.log('DB connection closed.');
  }
}

run();
