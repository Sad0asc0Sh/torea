const pool = require('../config/db');

/**
 * Builds a hierarchical tree structure from flat array of organization nodes
 * @param {Array} rows - Flat array of org nodes with id, parent_id, and children properties
 * @returns {Array} Array of root nodes with nested children
 */
function buildTree(rows) {
  const byId = new Map();
  const roots = [];

  // init
  for (const r of rows) {
    byId.set(r.id, { ...r, children: [] });
  }

  // link
  for (const r of rows) {
    const node = byId.get(r.id);
    const pid = r.parent_id;

    if (pid && byId.has(pid)) {
      byId.get(pid).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Fetches organization nodes from database and returns as hierarchical tree
 * @returns {Promise<Array>} Promise resolving to tree structure of org nodes
 * @throws {Error} Logs error and returns empty array on failure
 */
async function getOrgNodes() {
  try {
    const q = await pool.query(`
      SELECT id, title, parent_id, level
      FROM org_nodes
      ORDER BY COALESCE(parent_id, 0), level ASC, id ASC
    `);
    return buildTree(q.rows);
  } catch (err) {
    console.error('[org.js] getOrgNodes error:', err);
    return [];
  }
}

/**
 * Fetches organization nodes as flat array ordered by ID
 * @returns {Promise<Array>} Promise resolving to flat array of org nodes
 * @throws {Error} Logs error and returns empty array on failure
 */
async function getOrgNodesFlat() {
  try {
    const q = await pool.query(`
      SELECT id, title, parent_id, level
      FROM org_nodes
      ORDER BY id ASC
    `);
    return q.rows;
  } catch (err) {
    console.error('[org.js] getOrgNodesFlat error:', err);
    return [];
  }
}

module.exports = { getOrgNodes, getOrgNodesFlat, buildTree };
