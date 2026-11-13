'use strict';

const express = require('express');
const { requireLogin } = require('../../middlewares/auth');
const { enforceStatus } = require('../../middlewares/guards');
const { listReportsFromCode, syncReportsToDatabase, listActiveReports } = require('../../services/reports.service');
const router = express.Router();
const { toIntOrNull, safeMsg } = require('../../utils/validators');
/**
 * Admin Routes
 *   1) /admin/definitions/hierarchy          => Define org roles (org_nodes)
 *   2) /admin/definitions/hierarchy/arrange  => Arrange parent-child edges (org_node_edges) with cycle protection
 */

// -----------------------------
// DB Pool (use centralized pool)
// -----------------------------
const pool = require('../../config/db');
const hierarchyPool = pool; // Keep alias for backward compatibility
function getSessionUser(req) {
  return (req && req.session && req.session.user) ? req.session.user : null;
}


async function addNotification(userId, notif_type, title, body, entity_type, entity_id) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, notif_type, title, body, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, notif_type, title, body || null, entity_type || null, entity_id || null]
    );
  } catch (e) {
    /* ignore */
  }
}

async function loadUserWithOrg(userId) {
  if (!userId) return null;
  try {
    const q = await pool.query(
      'SELECT id, org_node_id, role, first_name, last_name, username FROM users WHERE id=$1',
      [userId]
    );
    return q.rows[0] || null;
  } catch (e) {
    return null;
  }
}

// NOTE: intentionally NO auto-seed here.
// We allow org_nodes to be empty; admin defines nodes manually.
async function ensureRootAdminNode() {
  return true;
}

router.use(
  requireLogin,
  enforceStatus
);

async function fetchNodes() {
  const sql =
    "SELECT n.id, n.title, n.parent_id, COALESCE(n.level,1) AS level, " +
    "       COALESCE(n.branch,'ORG') AS branch, " +
    "       p.title AS parent_title " +
    "FROM org_nodes n " +
    "LEFT JOIN org_nodes p ON p.id = n.parent_id " +
    "WHERE COALESCE(n.branch,'ORG') <> 'SYSTEM' " +
    "ORDER BY COALESCE(n.level,1), n.id";
  const q = await hierarchyPool.query(sql);
  return q.rows || [];
}

function renderHierarchy(res, user, nodes, editNode, error, message) {
  // Provide extra aliases to avoid EJS mismatches from older templates
  return res.render('admin/hierarchy', {
    user: user || null,
    nodes: nodes || [],
    rows: nodes || [],
    options: nodes || [],
    editNode: editNode || null,
    error: error || null,
    message: message || null,
  });
}

// -----------------------------
// Basic admin pages
// -----------------------------
router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', { user: getSessionUser(req) });
});

// -----------------------------
// Approvals - Redirect to Inbox
// -----------------------------
router.get('/approvals', (req, res) => {
  res.redirect(301, '/admin/inbox');
});

// Redirect legacy approval routes to unified inbox
router.get('/approvals/credit-sales', (req, res) => res.redirect(301, '/admin/inbox?category=credit'));
router.get('/approvals/settlements', (req, res) => res.redirect(301, '/admin/inbox?category=credit'));
router.get('/approvals/automation', (req, res) => res.redirect(301, '/admin/inbox?category=automation'));
router.get('/approvals/automation/requests', (req, res) => res.redirect(301, '/admin/inbox?category=automation'));
router.get('/approvals/automation/referrals', (req, res) => res.redirect(301, '/admin/inbox?category=automation'));
router.get('/approvals/automation/announcements', (req, res) => res.redirect(301, '/admin/inbox?category=automation'));
router.get('/approvals/team-users-auth', (req, res) => res.redirect(301, '/admin/inbox?category=users'));

router.post('/approvals/action', async (req, res) => {
  const id = toIntOrNull(req.body && req.body.id);
  const action = (req.body && req.body.action) ? String(req.body.action) : '';
  const kind = (req.body && req.body.kind) ? String(req.body.kind) : 'user';

  if (!id || (action !== 'approve' && action !== 'reject')) {
    return res.redirect('/admin/inbox');
  }

  if (kind === 'automation') {
    const actor = getSessionUser(req);
    const actorId = actor?.id || null;
    const isSystemAdmin = actor?.role === 'SYSTEM_ADMIN';
    const decision_note = safeMsg(req.body && req.body.decision_note);
    const decision_voice_path = (req.body && req.body.decision_voice_path ? String(req.body.decision_voice_path) : '').trim() || null;
    try {
      const itemRes = await pool.query(
        `SELECT id, status, approver_user_id, created_by_user_id
           FROM automation_items
          WHERE id = $1
          LIMIT 1`,
        [id]
      );
      if (!itemRes.rows.length) return res.redirect('/admin/inbox');
      const item = itemRes.rows[0];
      if (item.status !== 'pending') return res.redirect('/admin/inbox');
      if (!isSystemAdmin && item.approver_user_id !== actorId) return res.redirect('/admin/inbox');

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await pool.query(
        `UPDATE automation_items
            SET status = $1,
                decision_note = $2,
                decision_voice_path = $3,
                decided_at = NOW(),
                approver_user_id = $4
          WHERE id = $5`,
        [newStatus, decision_note, decision_voice_path, actorId, id]
      );
      await addNotification(
        item.created_by_user_id,
        'automation_request_decision',
        newStatus === 'approved' ? 'درخواست شما تأیید شد' : 'درخواست شما رد شد',
        decision_note || null,
        'automation_item',
        id
      );
    } catch (e) {
      console.error('POST /admin/approvals/action automation error:', e);
    }
    return res.redirect('/admin/inbox');
  }

  const approvedBy = (req.session && req.session.user) ? req.session.user.id : null;

  try {
    if (action === 'approve') {
      await pool.query(
        'UPDATE users SET status=$1, active=$2, approved_by=$3 WHERE id=$4',
        ['active', true, approvedBy, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET status=$1, active=$2, approved_by=$3 WHERE id=$4',
        ['rejected', false, null, id]
      );
    }
  } catch (e) {
    console.error('POST /admin/approvals/action error:', e);
  }

  return res.redirect('/admin/inbox');
});

// -----------------------------
// Reports
// -----------------------------
router.get('/reports', async (req, res) => {
  const user = getSessionUser(req);
  try {
    const dbReports = await listActiveReports();
    const codeReports = listReportsFromCode();
    const okMsg = safeMsg(req.query && req.query.ok) || (req.query && req.query.ok ? 'همگام‌سازی انجام شد.' : null);
    return res.render('admin/reports/index', {
      user,
      dbReports,
      codeReports,
      error: safeMsg(req.query && req.query.err),
      message: okMsg,
    });
  } catch (e) {
    console.error('GET /admin/reports error:', e);
    return res.render('admin/reports/index', {
      user,
      dbReports: [],
      codeReports: [],
      error: 'خطا در خواندن لیست گزارشات',
      message: null,
    });
  }
});

function reportsPlaceholder(activeKey, title) {
  return (req, res) =>
    res.render('admin/reports/placeholder', {
      user: getSessionUser(req),
      activeKey,
      title,
      message: 'این گزارش به زودی در دسترس خواهد بود.',
      backHref: '/admin/reports',
    });
}

router.get('/reports/personal', reportsPlaceholder('reports_personal', 'گزارش فردی'));
router.get('/reports/team', reportsPlaceholder('reports_team', 'گزارش تیم'));
router.get('/reports/competitors', reportsPlaceholder('reports_competitors', 'گزارش رقبا'));
router.get('/reports/company', reportsPlaceholder('reports_company', 'گزارش سازمان'));

// Route removed - reports are now managed via /admin/settings/catalog-manager

// ============================================================
// Hierarchy (org_nodes) - define roles/titles
// ============================================================
router.get('/definitions/hierarchy', async (req, res) => {
  const user = getSessionUser(req);
  const editId = toIntOrNull(req.query && (req.query.edit_id || req.query.edit));
  const error = safeMsg(req.query && req.query.err);
  const message = safeMsg(req.query && req.query.ok);

  try {
    await ensureRootAdminNode();
    const nodes = await fetchNodes();

    const editNode = editId ? nodes.find((n) => Number(n.id) === Number(editId)) : null;
    return renderHierarchy(res, user, nodes, editNode, error, message);
  } catch (e) {
    console.error('hierarchy GET error:', e);
    return renderHierarchy(
      res,
      user,
      [],
      null,
      error || (e && e.message ? e.message : 'خطا در بارگذاری سلسله‌مراتب.'),
      message
    );
  }
});

router.post('/definitions/hierarchy', async (req, res) => {
  const user = getSessionUser(req);

  const title = (req.body && req.body.title) ? String(req.body.title).trim() : '';
  try {
    await ensureRootAdminNode();

    if (!title) {
      const nodes = await fetchNodes().catch(() => []);
      return renderHierarchy(res, user, nodes, null, 'عنوان را وارد کنید.', null);
    }

    // Only insert title; parent_id stays NULL until set via /arrange route
    // DB triggers will handle level calculation when parent_id is set
    await hierarchyPool.query(
      'INSERT INTO org_nodes(title, parent_id) VALUES ($1, NULL)',
      [title]
    );

    return res.redirect('/admin/definitions/hierarchy?ok=' + encodeURIComponent('با موفقیت ثبت شد.'));
  } catch (e) {
    console.error('hierarchy POST error:', e);

    // Friendly duplicate handling
    const msg =
      (e && String(e.code) === '23505')
        ? 'این سمت قبلاً ثبت شده است.'
        : 'خطا در ذخیره‌سازی. دوباره تلاش کنید.';

    return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
  }
});

router.post('/definitions/hierarchy/update', async (req, res) => {
  const user = getSessionUser(req);

  const id = toIntOrNull(req.body && req.body.id);
  const title = (req.body && req.body.title) ? String(req.body.title).trim() : '';

  if (!id) return res.redirect('/admin/definitions/hierarchy');

  try {
    await ensureRootAdminNode();

    if (!title) {
      const nodes = await fetchNodes().catch(() => []);
      return renderHierarchy(res, user, nodes, { id, title }, 'عنوان را وارد کنید.', null);
    }

    // Only update title; parent_id and level are managed via /arrange route
    await hierarchyPool.query(
      'UPDATE org_nodes SET title=$1 WHERE id=$2',
      [title, id]
    );

    return res.redirect('/admin/definitions/hierarchy?ok=' + encodeURIComponent('ویرایش با موفقیت انجام شد.'));
  } catch (e) {
    console.error('hierarchy UPDATE error:', e);
    const msg =
      (e && String(e.code) === '23505')
        ? 'این سمت قبلاً ثبت شده است.'
        : 'خطا در ویرایش. دوباره تلاش کنید.';
    return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
  }
});

router.post('/definitions/hierarchy/delete', async (req, res) => {
  const id = toIntOrNull(req.body && req.body.id);
  if (!id) return res.redirect('/admin/definitions/hierarchy');

  try {
    await ensureRootAdminNode();

    // Protect against deleting nodes that are referenced
    const usersRef = await hierarchyPool.query('SELECT COUNT(*)::int AS c FROM users WHERE org_node_id=$1', [id]);
    const confRef = await hierarchyPool.query('SELECT COUNT(*)::int AS c FROM user_confirmations WHERE confirmed_by_node_id=$1', [id]).catch(() => ({ rows: [{ c: 0 }] }));

    const refUsers = (usersRef.rows[0] && usersRef.rows[0].c) ? usersRef.rows[0].c : 0;
    const refConf = (confRef.rows[0] && confRef.rows[0].c) ? confRef.rows[0].c : 0;

    if (refUsers > 0 || refConf > 0) {
      const msg = 'این سمت در سیستم استفاده شده و قابل حذف نیست. (کاربران: ' + refUsers + ', تأییدها: ' + refConf + ')';
      return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
    }

    // If has children in org_nodes, do not delete
    const children = await hierarchyPool.query('SELECT COUNT(*)::int AS c FROM org_nodes WHERE parent_id=$1', [id]);
    const ch = (children.rows[0] && children.rows[0].c) ? children.rows[0].c : 0;
    if (ch > 0) {
      return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent('این لایه زیرمجموعه دارد و قابل حذف نیست.'));
    }

    // Delete from org_nodes; edges will cascade automatically via FK constraints
    await hierarchyPool.query('DELETE FROM org_nodes WHERE id=$1', [id]);

    return res.redirect('/admin/definitions/hierarchy?ok=' + encodeURIComponent('حذف با موفقیت انجام شد.'));
  } catch (e) {
    console.error('hierarchy DELETE error:', e);
    // If FK fails anyway, show a clearer message
    const msg =
      (e && String(e.code) === '23503')
        ? 'این سمت در سیستم استفاده شده و قابل حذف نیست.'
        : 'خطا در حذف. دوباره تلاش کنید.';
    return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
  }
});

// ============================================================
// Hierarchy Arrange (org_node_edges) - set parent/child edges
// ============================================================
router.get('/definitions/hierarchy/arrange', async (req, res) => {
  const user = getSessionUser(req);
  try {
    await ensureRootAdminNode();

    const nodesQ = await hierarchyPool.query(
      "SELECT id, title FROM org_nodes WHERE COALESCE(branch,'ORG') <> 'SYSTEM' ORDER BY COALESCE(level,1), id"
    );

    // If table doesn't exist yet, show empty edges
    let edgesRows = [];
    try {
      const edgesSql =
        "SELECT e.child_id, e.parent_id, " +
        "       c.title AS child_title, " +
        "       p.title AS parent_title " +
        "FROM org_node_edges e " +
        "JOIN org_nodes c ON c.id = e.child_id " +
        "LEFT JOIN org_nodes p ON p.id = e.parent_id " +
        "ORDER BY c.id";
      const edgesQ = await hierarchyPool.query(edgesSql);
      edgesRows = edgesQ.rows || [];
    } catch (e) {
      console.error('hierarchy arrange edges read error:', e);
      edgesRows = [];
    }

    return res.render('admin/hierarchy_arrange', {
      user,
      nodes: nodesQ.rows || [],
      edges: edgesRows,
      error: safeMsg(req.query && req.query.err),
      message: safeMsg(req.query && req.query.ok),
    });
  } catch (e) {
    console.error('hierarchy arrange GET error:', e);
    return res.status(200).send('خطا در بارگذاری صفحه چیدمان سلسله‌مراتب');
  }
});

router.post('/definitions/hierarchy/link', async (req, res) => {
  const parentId = toIntOrNull(req.body && req.body.parent_id);
  const childId = toIntOrNull(req.body && req.body.child_id);

  try {
    await ensureRootAdminNode();

    if (!parentId || !childId) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('هر دو مورد را انتخاب کنید.'));
    }
    if (parentId === childId) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('یک سمت نمی‌تواند بالادست خودش باشد.'));
    }

    // Verify both exist
    const chk = await hierarchyPool.query(
      'SELECT id FROM org_nodes WHERE id = ANY($1::int[])',
      [[parentId, childId]]
    );
    if ((chk.rows || []).length !== 2) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('سمت انتخاب‌شده معتبر نیست.'));
    }

    // LOOP CHECK (edges):
    // If proposed parent is in descendants of child, then child->parent makes a cycle.
    const loopSql =
      "WITH RECURSIVE sub AS ( " +
      "  SELECT child_id FROM org_node_edges WHERE parent_id = $1 " +
      "  UNION ALL " +
      "  SELECT e.child_id FROM org_node_edges e JOIN sub s ON e.parent_id = s.child_id " +
      ") " +
      "SELECT 1 AS hit FROM sub WHERE child_id = $2 LIMIT 1";

    const loop = await hierarchyPool.query(loopSql, [childId, parentId]);
    if ((loop.rows || []).length) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('این انتخاب باعث لوپ در درخت می‌شود و مجاز نیست.'));
    }

    // Only update org_nodes parent_id; DB triggers will handle edges and levels
    // (bria_org_nodes_to_edges + bria_after_edges_sync)
    await hierarchyPool.query(
      'UPDATE org_nodes SET parent_id=$1 WHERE id=$2',
      [parentId, childId]
    );

    return res.redirect('/admin/definitions/hierarchy/arrange?ok=' + encodeURIComponent('رابطه ثبت شد.'));
  } catch (e) {
    console.error('hierarchy link POST error:', e);
    const errMsg = String(e.message || e);
    // Check for cycle errors from DB triggers
    if (errMsg.includes('cycle detected') || errMsg.includes('Invalid hierarchy')) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('این انتخاب باعث لوپ در درخت می‌شود و مجاز نیست.'));
    }
    return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('خطا در ثبت رابطه.'));
  }
});

// -----------------------------
// Raw DB health pages (existing)
// -----------------------------
router.get('/definitions/baskets', (req, res) => {
  return res.redirect(
    '/admin/definitions?warn=' + encodeURIComponent('این بخش حذف شده')
  );
});

router.post('/definitions/baskets/:id/delete', (req, res) => {
  return res.redirect(
    '/admin/definitions?warn=' + encodeURIComponent('این بخش حذف شده')
  );
});

module.exports = router;
