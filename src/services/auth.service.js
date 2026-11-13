const pool = require('../config/db');

async function getUserByUsername(username) {
  const normalizedUsername = String(username ?? '').trim();
  const q = await pool.query(
    'SELECT * FROM users WHERE lower(trim(username)) = lower(trim($1)) LIMIT 1',
    [normalizedUsername],
  );
  return q.rows[0] || null;
}

async function countUsers() {
  const q = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  return q.rows[0]?.c ?? 0;
}

async function getSystemSetting(key) {
  const q = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return q.rows[0]?.value ?? null;
}

module.exports = { getUserByUsername, countUsers, getSystemSetting };
