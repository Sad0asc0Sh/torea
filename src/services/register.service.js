const pool = require('../config/db');

async function usernameExists(username) {
  const q = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  return q.rows.length > 0;
}

async function insertPendingUser({
  first_name,
  last_name,
  phone,
  telegram_id,
  username,
  password_hash,
  verification_code,
  role,
  org_node_id,
  manager_id,
}) {
  const ins = await pool.query(
    `
    INSERT INTO users
      (first_name, last_name, phone, telegram_id, username, password_hash,
       verification_code, status, role, active, org_node_id, manager_id)
    VALUES
      ($1,        $2,       $3,    $4,         $5,       $6,
       $7,               'pending_verification', $8, false, $9, $10)
    RETURNING id, username, telegram_id
    `,
    [
      first_name || null,
      last_name || null,
      phone || null,
      telegram_id || null,
      username,
      password_hash,
      verification_code || null,
      role,
      org_node_id || null,
      manager_id || null,
    ]
  );
  return ins.rows[0] || null;
}

async function getUserById(id) {
  const q = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return q.rows[0] || null;
}

async function usernameUsedByOther(username, id) {
  const q = await pool.query('SELECT id FROM users WHERE username = $1 AND id <> $2', [username, id]);
  return q.rows.length > 0;
}

async function updatePendingUser({
  id,
  first_name,
  last_name,
  phone,
  telegram_id,
  username,
  org_node_id,
  manager_id,
  password_hash, // optional
}) {
  if (password_hash) {
    await pool.query(
      `
      UPDATE users
         SET first_name   = $1,
             last_name    = $2,
             phone        = $3,
             telegram_id  = $4,
             username     = $5,
             org_node_id  = $6,
             manager_id   = $7,
             password_hash = $9
       WHERE id = $8
      `,
      [
        first_name || null,
        last_name || null,
        phone || null,
        telegram_id || null,
        username,
        org_node_id || null,
        manager_id || null,
        id,
        password_hash,
      ]
    );
  } else {
    await pool.query(
      `
      UPDATE users
         SET first_name   = $1,
             last_name    = $2,
             phone        = $3,
             telegram_id  = $4,
             username     = $5,
             org_node_id  = $6,
             manager_id   = $7
       WHERE id = $8
      `,
      [
        first_name || null,
        last_name || null,
        phone || null,
        telegram_id || null,
        username,
        org_node_id || null,
        manager_id || null,
        id,
      ]
    );
  }
}

module.exports = {
  usernameExists,
  insertPendingUser,
  getUserById,
  usernameUsedByOther,
  updatePendingUser,
};
