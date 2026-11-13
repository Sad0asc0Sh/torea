'use strict';

const pool = require('../config/db');

async function getUserDescendants(userId) {
  if (!userId) return [];
  const q = await pool.query(
    `
    WITH RECURSIVE sub AS (
      SELECT id FROM users WHERE id = $1
      UNION ALL
      SELECT u.id FROM users u
      JOIN sub s ON u.manager_id = s.id
    )
    SELECT id FROM sub
    `,
    [userId]
  );
  return (q.rows || []).map((r) => r.id);
}

async function getRivalUserIds(orgNodeId, userId) {
  if (!orgNodeId) return [];
  const q = await pool.query(
    `
    SELECT id
    FROM users
    WHERE org_node_id = $1
      AND ($2::text IS NULL OR id <> $2::text)
      AND active = TRUE
    `,
    [orgNodeId, userId || null]
  );
  return (q.rows || []).map((r) => r.id);
}

module.exports = {
  getUserDescendants,
  getRivalUserIds,
};
