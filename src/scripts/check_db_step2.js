require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  console.log('--- DB CHECK: users & org_nodes structure ---');

  try {
    await pool.query('SELECT 1');
    console.log('DB connection: OK\n');

    // 1) نوع ستون‌ها در جدول users
    const cols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('id', 'org_node_id', 'manager_id')
      ORDER BY column_name
    `);

    console.log('Users columns (id, org_node_id, manager_id):');
    cols.rows.forEach(r => {
      console.log(`  ${r.column_name} : ${r.data_type}`);
    });
    console.log('');

    // 2) کلیدهای خارجی جدول users
    const fks = await pool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'users'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY kcu.column_name;
    `);

    console.log('Users foreign keys:');
    fks.rows.forEach(r => {
      console.log(
        `  ${r.constraint_name}: ${r.column_name} -> ${r.foreign_table_name}(${r.foreign_column_name})`
      );
    });
    console.log('');

    // 3) تعداد رکوردها در users و org_nodes
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users)      AS users_count,
        (SELECT COUNT(*) FROM org_nodes)  AS org_nodes_count
    `);

    const c = counts.rows[0];
    console.log('Row counts:');
    console.log(`  users      : ${c.users_count}`);
    console.log(`  org_nodes  : ${c.org_nodes_count}`);
    console.log('');

    console.log('DB CHECK FINISHED ✅');
  } catch (err) {
    console.error('DB CHECK ERROR:', err);
  } finally {
    await pool.end();
    console.log('DB connection closed.');
  }
}

run();
