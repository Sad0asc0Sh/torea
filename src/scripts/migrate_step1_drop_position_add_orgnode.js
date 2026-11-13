require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('--- Step 1: DB migration (delete users, drop position, add org_node_id) ---');
  try {
    await pool.query('SELECT 1');
    console.log('DB connection OK');

    console.log('Deleting ALL rows from "users"...');
    await pool.query('DELETE FROM users');
    console.log('All users deleted.');

    console.log('Dropping column "position" if exists...');
    await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS position');
    console.log('"position" column dropped (or did not exist).');

    console.log('Adding column "org_node_id" if not exists...');
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS org_node_id INTEGER REFERENCES org_nodes(id)
    `);
    console.log('"org_node_id" column ensured.');

    console.log('Migration step 1 finished successfully.');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
    console.log('DB connection closed.');
  }
}

run();
