'use strict';

const pool = require('../config/db');

const DEFAULT_ACCESS = { visible: false, show_on_dashboard: false };

async function fetchOrgNodeMode(orgNodeId) {
  if (!orgNodeId) return 'USER';
  const q = await pool.query('SELECT mode FROM org_node_catalog_mode WHERE org_node_id = $1', [orgNodeId]);
  return q.rows[0]?.mode || 'USER';
}

async function setOrgNodeMode(orgNodeId, mode = 'USER', clientOverride = null) {
  const normalized = mode === 'ADMIN' ? 'ADMIN' : 'USER';
  if (!orgNodeId) return normalized;
  const db = clientOverride || pool;
  await db.query(
    `
    INSERT INTO org_node_catalog_mode (org_node_id, mode)
    VALUES ($1, $2)
    ON CONFLICT (org_node_id)
    DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW()
  `,
    [orgNodeId, normalized]
  );
  return normalized;
}

function buildTree(records, { mode, accessMap, preferAdminRoutes }) {
  const byKey = new Map();
  const access = accessMap || new Map();

  records.forEach((row) => {
    const nodeType = String(row.type || 'page').toLowerCase();
    const href = preferAdminRoutes ? row.route_admin || row.route_user : row.route_user || row.route_admin;
    const own = access.get(row.key) || DEFAULT_ACCESS;
    const directGrant = mode === 'ADMIN' ? true : own.visible === true;
    const showOnDashboard = mode === 'ADMIN' ? true : own.show_on_dashboard === true;
    byKey.set(row.key, {
      ...row,
      type: nodeType,
      href: href || null,
      children: [],
      direct_grant: directGrant,
      inherited: false,
      effective: false,
      visible: false,
      show_on_dashboard: showOnDashboard,
    });
  });

  byKey.forEach((node) => {
    if (node.parent_key && byKey.get(node.parent_key)) {
      byKey.get(node.parent_key).children.push(node);
    }
  });

  const computing = new Set();
  const computed = new Set();

  const computeEffective = (key) => {
    const node = byKey.get(key);
    if (!node) return false;
    if (computed.has(key)) return node.effective;
    if (computing.has(key)) return node.effective;
    computing.add(key);

    const parent = node.parent_key ? byKey.get(node.parent_key) : null;
    const parentEffective = parent ? computeEffective(parent.key) : false;

    if (mode === 'ADMIN') {
      node.effective = true;
      node.inherited = !node.direct_grant && !!parent;
    } else if (node.type === 'action') {
      node.effective = !!node.direct_grant;
      node.inherited = false;
    } else {
      node.effective = !!(node.direct_grant || parentEffective);
      node.inherited = node.effective && !node.direct_grant && parentEffective;
    }
    node.visible = node.effective;

    computing.delete(key);
    computed.add(key);
    return node.effective;
  };

  Array.from(byKey.keys()).forEach((k) => computeEffective(k));

  const roots = [];
  byKey.forEach((node) => {
    if (node.parent_key && byKey.get(node.parent_key)) return;
    roots.push(node);
  });

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      const ord = (a.order_index || 0) - (b.order_index || 0);
      if (ord !== 0) return ord;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    nodes.forEach((n) => sortNodes(n.children || []));
  };

  sortNodes(roots);

  const flatAll = [];
  const flatEffective = [];
  const walk = (nodes) => {
    nodes.forEach((n) => {
      flatAll.push(n);
      if (n.effective) flatEffective.push(n);
      if (n.children?.length) walk(n.children);
    });
  };
  walk(roots);

  const buildMenu = (nodes, { onlyEffective } = {}) => {
    const menuItems = [];
    const visit = (list) => {
      list.forEach((n) => {
        const qualifies = onlyEffective ? n.effective : true;
        if (n.href && qualifies) {
          menuItems.push({
            key: n.key,
            label: n.title,
            href: n.href || n.route_user || n.route_admin || '#',
          });
        }
        if (n.children?.length) visit(n.children);
      });
    };
    visit(nodes);
    return menuItems;
  };

  const menu = buildMenu(roots, { onlyEffective: true });
  const menuAll = buildMenu(roots, { onlyEffective: false });
  const allowedRoutes = flatEffective.filter((n) => n.href).map((n) => n.href);

  return { tree: roots, flat: flatEffective, flatAll, menu, menuAll, allowedRoutes };
}

async function getEffectiveCatalogForOrgNode(orgNodeId, options = {}) {
  const preferAdminRoutes = !!options.preferAdminRoutes;
  const modeOverride = options.modeOverride || null;
  const mode = modeOverride || (await fetchOrgNodeMode(orgNodeId));

  const itemsQ = await pool.query(
    `
      SELECT key, type, title, description, route_admin, route_user, parent_key, order_index, is_active
      FROM catalog_items
      WHERE is_active = TRUE
      ORDER BY order_index ASC, key ASC
    `
  );
  const rows = itemsQ.rows || [];
  const routesAdmin = rows.map((r) => r.route_admin).filter(Boolean);
  const routesUser = rows.map((r) => r.route_user).filter(Boolean);
  const access = new Map();

  if (mode !== 'ADMIN' && orgNodeId) {
    const accessQ = await pool.query(
      'SELECT item_key, visible, show_on_dashboard FROM org_node_item_access WHERE org_node_id = $1',
      [orgNodeId]
    );
    (accessQ.rows || []).forEach((r) => {
      access.set(r.item_key, { visible: r.visible === true, show_on_dashboard: r.show_on_dashboard === true });
    });
  }

  const built = buildTree(rows, { mode, accessMap: access, preferAdminRoutes });
  return { mode, routes: { admin: routesAdmin, user: routesUser }, ...built };
}

async function saveOrgNodeItemAccess(orgNodeId, { visibleKeys = [], dashboardKeys = [], mode = 'USER' }) {
  if (!orgNodeId) return 'USER';
  const visibleSet = new Set((visibleKeys || []).map(String));
  const dashboardSet = new Set((dashboardKeys || []).map(String));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const normalizedMode = await setOrgNodeMode(orgNodeId, mode, client);

    if (normalizedMode === 'ADMIN') {
      await client.query('COMMIT');
      return normalizedMode;
    }

    await client.query('UPDATE org_node_item_access SET visible = FALSE, show_on_dashboard = FALSE WHERE org_node_id = $1', [
      orgNodeId,
    ]);

    for (const key of visibleSet) {
      await client.query(
        `
        INSERT INTO org_node_item_access (org_node_id, item_key, visible, show_on_dashboard)
        VALUES ($1, $2, TRUE, $3)
        ON CONFLICT (org_node_id, item_key)
        DO UPDATE SET visible = EXCLUDED.visible, show_on_dashboard = EXCLUDED.show_on_dashboard, updated_at = NOW()
      `,
        [orgNodeId, key, dashboardSet.has(key)]
      );
    }

    await client.query('COMMIT');
    return normalizedMode;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('saveOrgNodeItemAccess error:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getEffectiveCatalogForOrgNode,
  saveOrgNodeItemAccess,
  setOrgNodeMode,
  fetchOrgNodeMode,
  buildTree,
  // syncReportNavigationItems removed - reports are now managed via catalog-manager UI
};
