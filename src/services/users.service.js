
const pool = require('../config/db');

function normalizeNames({ first_name, last_name }) {
  const fn = (first_name ?? "").toString().trim();
  const ln = (last_name  ?? "").toString().trim();

  if (fn || ln) return { first_name: fn || null, last_name: ln || null };
  return { first_name: null, last_name: null };
}

async function listUsers() {
  const q = await pool.query('SELECT * FROM users ORDER BY id DESC');
  return q.rows;
}

async function listUsersDetailed() {
  const q = await pool.query(
    `SELECT
       u.id,
       CONCAT_WS(\' \', u.first_name, u.last_name) AS display_name,
       u.first_name,
       u.last_name,
       u.accounting_code,
        u.phone,
       u.username,
       u.role,
       u.active,
       u.status,
       u.org_node_id,
       u.manager_id,
       o.title AS org_title,
       CONCAT_WS(\' \', m.first_name, m.last_name) AS manager_name,
       m.username AS manager_username
     FROM users u
     LEFT JOIN org_nodes o ON o.id = u.org_node_id
     LEFT JOIN users     m ON m.id = u.manager_id
     ORDER BY u.id DESC`
  );
  return q.rows;
}

async function listUsersWithOrgTitle() {
  const q = await pool.query(
    `SELECT
       u.id,
       u.username,
       u.first_name,
        u.last_name,
        u.accounting_code,
        u.phone,
        u.role,
        u.status,
       u.active,
       u.org_node_id,
       o.title AS org_node_title
     FROM users u
     LEFT JOIN org_nodes o ON o.id = u.org_node_id
     ORDER BY u.id DESC`
  );
  return q.rows;
}

async function getUserById(id) {
  const q = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return q.rows[0] || null;
}

async function getUserIdRole(id) {
  const q = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
  return q.rows[0] || null;
}

async function deleteUserById(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

async function listOrgNodes() {
  const q = await pool.query('SELECT * FROM org_nodes ORDER BY id ASC');
  return q.rows;
}

async function listAllUsersBasic() {
  const q = await pool.query(
    `SELECT
       id,
       CONCAT_WS(\' \', first_name, last_name) AS display_name,
       first_name,
       last_name,
       username,
       role
      FROM users
      ORDER BY id DESC`
  );
  return q.rows;
}

async function listUsersWithOrgNode() {
  const q = await pool.query(
    `SELECT
        id,
         CONCAT_WS(\' \', first_name, last_name) AS display_name,
         first_name,
         last_name,
         accounting_code,
         username,
         role,
         org_node_id
      FROM users
      ORDER BY created_at ASC`
  );
  return q.rows;
}

async function listDistinctRoles() {
  const q = await pool.query(
    'SELECT DISTINCT role FROM users WHERE role IS NOT NULL ORDER BY role ASC'
  );
  return (q.rows || []).map((r) => r.role).filter(Boolean);
}

async function listDistinctStatuses() {
  const q = await pool.query(
    'SELECT DISTINCT status FROM users WHERE status IS NOT NULL ORDER BY status ASC'
  );
  return (q.rows || []).map((r) => r.status).filter(Boolean);
}

async function updateUserNoPassword({
  id,
  first_name,
  last_name,
  accounting_code,
  phone,
  telegram_id,
  username,
  role,
  activeBool,
  orgNodeId,
  managerIdToSave,
  statusToSave = null,
  approvedBy = null,
  approvedAt = null,
}) {
  const n = normalizeNames({ first_name, last_name });
  await pool.query(
    `UPDATE users
        SET first_name=$1, last_name=$2, accounting_code=$3, phone=$4, telegram_id=$5, username=$6,
            role=$7, active=$8, org_node_id=$9, manager_id=$10,
            status=COALESCE($11, status), approved_by=COALESCE($12, approved_by), approved_at=COALESCE($13, approved_at)
      WHERE id=$14`,
    [
      n.first_name,
      n.last_name,
      accounting_code ? accounting_code.trim() || null : null,
      phone || null,
      telegram_id || null,
      username,
      role,
      activeBool,
      orgNodeId || null,
      managerIdToSave || null,
      statusToSave,
      approvedBy,
      approvedAt,
      id,
    ]
  );
}

async function updateUserWithPassword({
  id,
  first_name,
  last_name,
  accounting_code,
  phone,
  telegram_id,
  username,
  role,
  activeBool,
  password_hash,
  orgNodeId,
  managerIdToSave,
  statusToSave = null,
  approvedBy = null,
  approvedAt = null,
}) {
  const n = normalizeNames({ first_name, last_name });
  await pool.query(
    `UPDATE users
        SET first_name=$1, last_name=$2, accounting_code=$3, phone=$4, telegram_id=$5, username=$6,
            role=$7, active=$8, password_hash=$9, org_node_id=$10, manager_id=$11,
            status=COALESCE($12, status), approved_by=COALESCE($13, approved_by), approved_at=COALESCE($14, approved_at)
      WHERE id=$15`,
    [
      n.first_name,
      n.last_name,
      accounting_code ? accounting_code.trim() || null : null,
      phone || null,
      telegram_id || null,
      username,
      role,
      activeBool,
      password_hash,
      orgNodeId || null,
      managerIdToSave || null,
      statusToSave,
      approvedBy,
      approvedAt,
      id,
    ]
  );
}

async function updateUserDefinitions({
  id,
  first_name,
  last_name,
  accounting_code,
  phone,
  orgNodeId,
  activeBool,
  status,
  role,
}) {
  const n = normalizeNames({ first_name, last_name });
  await pool.query(
    `UPDATE users
        SET first_name=$1,
            last_name=$2,
            accounting_code=$3,
            phone=$4,
            org_node_id=$5,
            active=$6,
            status=$7,
            role=$8
      WHERE id=$9`,
    [
      n.first_name,
      n.last_name,
      accounting_code ? accounting_code.trim() || null : null,
      phone || null,
      orgNodeId || null,
      activeBool,
      status,
      role,
      id,
    ]
  );
}

/**
 * Check if an accounting_code is already used by another user.
 * @param {string} accounting_code
 * @param {string|number|null} excludeId user id to exclude from duplicate check
 * @returns {Promise<boolean>}
 */
async function isAccountingCodeTaken(accounting_code, excludeId = null) {
  const code = (accounting_code ?? "").toString().trim();
  if (!code) return false;
  const params = [code];
  let sql = 'SELECT 1 FROM users WHERE accounting_code = $1';
  if (excludeId) {
    sql += ' AND id <> $2';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  const q = await pool.query(sql, params);
  return q.rows.length > 0;
}

module.exports = {
  listUsers,
  getUserById,
  deleteUserById,
  listOrgNodes,
  listAllUsersBasic,
  listUsersWithOrgNode,
  updateUserNoPassword,
  updateUserWithPassword,
  listUsersDetailed,
  getUserIdRole,
  listUsersWithOrgTitle,
  listDistinctRoles,
  listDistinctStatuses,
  updateUserDefinitions,
  isAccountingCodeTaken,
};
