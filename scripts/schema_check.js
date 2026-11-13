const pool = require('../src/config/db');

(async () => {
  const q1 = await pool.query(`
    SELECT username, COUNT(*) c
    FROM users
    GROUP BY username
    HAVING COUNT(*) > 1
    ORDER BY c DESC;
  `);

  const q2 = await pool.query(`
    SELECT telegram_id, COUNT(*) c
    FROM users
    WHERE telegram_id IS NOT NULL AND telegram_id <> ''
    GROUP BY telegram_id
    HAVING COUNT(*) > 1
    ORDER BY c DESC;
  `);

  const q3 = await pool.query(`
    SELECT key, COUNT(*) c
    FROM system_settings
    GROUP BY key
    HAVING COUNT(*) > 1
    ORDER BY c DESC;
  `);

  console.log("\nDUP usernames:", q1.rows.length ? q1.rows : "OK");
  console.log("\nDUP telegram_id:", q2.rows.length ? q2.rows : "OK");
  console.log("\nDUP system_settings.key:", q3.rows.length ? q3.rows : "OK");

  await pool.end();
})().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
