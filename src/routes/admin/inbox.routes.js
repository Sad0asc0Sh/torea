'use strict';

const express = require('express');
const pool = require('../../config/db');
const { requireLogin } = require('../../middlewares/auth');
const { enforceStatus } = require('../../middlewares/guards');
const { getInboxItems, getInboxCounts } = require('../../services/inbox.service');

const router = express.Router();

/**
 * ⚠️ CRITICAL TYPE CONVERSIONS:
 * - users.id is UUID (string)
 * - automation_items.id is BIGINT (can be parsed as integer)
 * - credit_sale_requests.id is BIGINT
 * - credit_settlement_requests.id is SERIAL/INTEGER
 * - NEVER use toInt() for UUID fields!
 */

// Helper: Parse BIGINT safely
function toBigInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Helper: Validate UUID format
function isValidUUID(value) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof value === 'string' && uuidRegex.test(value);
}

// Helper: Check if user is system admin
function isSystemAdmin(user) {
  return String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';
}

// Helper: Get base path
const getBasePath = (req) => req.baseUrl || '/admin';

// =========================================
// GET /inbox - Main inbox page
// =========================================
router.get('/inbox', requireLogin, enforceStatus, async (req, res) => {
  const user = req.session?.user || null;
  const basePath = getBasePath(req);
  const category = req.query?.category || '';

  try {
    const filters = category ? { category } : {};
    const items = await getInboxItems(user, filters);
    const counts = await getInboxCounts(user);

    return res.render('shared/inbox/index', {
      user,
      basePath,
      items,
      counts,
      activeCategory: category,
      error: null,
      info: null
    });
  } catch (err) {
    console.error('[Inbox Routes] GET /inbox error:', err);
    return res.render('shared/inbox/index', {
      user,
      basePath,
      items: [],
      counts: { total: 0, automation: 0, training: 0, credit: 0, users: 0 },
      activeCategory: category,
      error: 'خطا در بارگذاری صندوق ورودی',
      info: null
    });
  }
});

// =========================================
// POST /inbox/automation/:id/:action
// =========================================
router.post('/inbox/automation/:id/:action', requireLogin, enforceStatus, async (req, res) => {
  const user = req.session?.user || null;
  const itemId = toBigInt(req.params?.id);  // ⚠️ BIGINT
  const action = String(req.params?.action || '').trim();

  if (!itemId || !action) {
    return res.status(400).json({ success: false, message: 'پارامترهای نامعتبر' });
  }

  try {
    // Check access: is this user a recipient?
    const checkQuery = await pool.query(
      `SELECT air.* 
       FROM automation_item_recipients air
       WHERE air.item_id = $1 AND air.user_id = $2::uuid AND air.status = 'pending'`,
      [itemId, user.id]
    );

    if (checkQuery.rows.length === 0 && !isSystemAdmin(user)) {
      return res.status(403).json({ success: false, message: 'شما دسترسی به این آیتم ندارید' });
    }

    // Determine new status
    let newStatus = null;
    switch (action) {
      case 'approve':
        newStatus = 'approved';
        break;
      case 'reject':
        newStatus = 'rejected';
        break;
      case 'acknowledge':
      case 'read':
        newStatus = 'acknowledged';
        break;
      default:
        return res.status(400).json({ success: false, message: 'عملیات نامعتبر' });
    }

    // Update recipient status
    await pool.query(
      `UPDATE automation_item_recipients 
       SET status = $1, action_at = NOW() 
       WHERE item_id = $2 AND user_id = $3::uuid`,
      [newStatus, itemId, user.id]
    );

    // Log action
    await pool.query(
      `INSERT INTO automation_item_logs (item_id, action_type, action_by_user_id, note)
       VALUES ($1, $2, $3::uuid, $4)`,
      [itemId, action, user.id, `اقدام: ${action}`]
    );

    // Check if all recipients approved
    const allRecipientsQuery = await pool.query(
      `SELECT COUNT(*) AS total, 
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count
       FROM automation_item_recipients 
       WHERE item_id = $1`,
      [itemId]
    );

    const { total, approved_count } = allRecipientsQuery.rows[0];
    if (parseInt(total, 10) === parseInt(approved_count, 10) && parseInt(total, 10) > 0) {
      // All approved → update item status
      await pool.query(
        `UPDATE automation_items SET status = 'approved' WHERE id = $1`,
        [itemId]
      );
    }

    return res.json({ success: true, message: 'انجام شد' });
  } catch (err) {
    console.error('[Inbox Routes] POST automation action error:', err);
    return res.status(500).json({ success: false, message: 'خطا در انجام عملیات' });
  }
});

// =========================================
// POST /inbox/automation/:id/forward
// =========================================
router.post('/inbox/automation/:id/forward', requireLogin, enforceStatus, async (req, res) => {
  const user = req.session?.user || null;
  const itemId = toBigInt(req.params?.id);  // ⚠️ BIGINT
  const forwardToUserId = String(req.body?.forward_to_user_id || '').trim();

  if (!itemId || !forwardToUserId || !isValidUUID(forwardToUserId)) {
    return res.status(400).json({ success: false, message: 'پارامترهای نامعتبر' });
  }

  try {
    // Mark current recipient as forwarded
    await pool.query(
      `UPDATE automation_item_recipients 
       SET status = 'forwarded', action_at = NOW() 
       WHERE item_id = $1 AND user_id = $2::uuid`,
      [itemId, user.id]
    );

    // Add new recipient
    await pool.query(
      `INSERT INTO automation_item_recipients (item_id, user_id, status, created_at)
       VALUES ($1, $2::uuid, 'pending', NOW())`,
      [itemId, forwardToUserId]
    );

    // Log action
    await pool.query(
      `INSERT INTO automation_item_logs (item_id, action_type, action_by_user_id, note)
       VALUES ($1, 'forwarded', $2::uuid, $3)`,
      [itemId, user.id, `ارجاع شده به: ${forwardToUserId}`]
    );

    // Send notification (if notifications table exists)
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, notif_type, title, body, entity_type, entity_id)
         VALUES ($1::uuid, 'automation_forward', 'آیتم جدید ارجاع شده', 'یک آیتم به شما ارجاع شده است.', 'automation_item', $2)`,
        [forwardToUserId, itemId]
      );
    } catch (notifErr) {
      console.warn('[Inbox Routes] Could not send notification:', notifErr.message);
    }

    return res.json({ success: true, message: 'ارجاع داده شد' });
  } catch (err) {
    console.error('[Inbox Routes] POST automation forward error:', err);
    return res.status(500).json({ success: false, message: 'خطا در ارجاع' });
  }
});

// =========================================
// POST /inbox/credit/:id/:action
// =========================================
router.post('/inbox/credit/:id/:action', requireLogin, enforceStatus, async (req, res) => {
  const user = req.session?.user || null;
  const itemId = toBigInt(req.params?.id);  // ⚠️ BIGINT or INTEGER
  const action = String(req.params?.action || '').trim();
  const entityType = String(req.body?.entity_type || '').trim();

  if (!itemId || !action || !entityType) {
    return res.status(400).json({ success: false, message: 'پارامترهای نامعتبر' });
  }

  try {
    if (entityType === 'credit_sale_request') {
      // ⚠️ itemId is BIGINT
      const saleQuery = await pool.query(
        `SELECT approver1_node_id, approver2_node_id, finance_user_id, finance_required
         FROM credit_sale_requests WHERE id = $1`,
        [itemId]
      );

      if (saleQuery.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
      }

      const sale = saleQuery.rows[0];
      const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;

      if (!status) {
        return res.status(400).json({ success: false, message: 'عملیات نامعتبر' });
      }

      // Determine which approver field to update
      if (sale.approver1_node_id === user.org_node_id) {
        await pool.query(
          `UPDATE credit_sale_requests 
           SET approver1_status = $1, updated_at = NOW() 
           WHERE id = $2`,
          [status, itemId]
        );
      } else if (sale.approver2_node_id === user.org_node_id) {
        await pool.query(
          `UPDATE credit_sale_requests 
           SET approver2_status = $1, updated_at = NOW() 
           WHERE id = $2`,
          [status, itemId]
        );
      } else if (sale.finance_required && sale.finance_user_id === user.id) {
        await pool.query(
          `UPDATE credit_sale_requests 
           SET finance_status = $1, updated_at = NOW() 
           WHERE id = $2`,
          [status, itemId]
        );
      } else if (isSystemAdmin(user)) {
        // System admin can approve all
        await pool.query(
          `UPDATE credit_sale_requests 
           SET approver1_status = $1, approver2_status = $1, finance_status = $1, updated_at = NOW() 
           WHERE id = $2`,
          [status, itemId]
        );
      } else {
        return res.status(403).json({ success: false, message: 'شما دسترسی ندارید' });
      }

      // Update final status
      await updateCreditSaleFinalStatus(itemId);

      return res.json({ success: true, message: action === 'approve' ? 'تایید شد' : 'رد شد' });

    } else if (entityType === 'credit_settlement_request') {
      // ⚠️ itemId is INTEGER (SERIAL)
      const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
      if (!status) {
        return res.status(400).json({ success: false, message: 'عملیات نامعتبر' });
      }

      await pool.query(
        `UPDATE credit_settlement_requests 
         SET status = $1, decided_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [status, itemId]
      );

      return res.json({ success: true, message: action === 'approve' ? 'تایید شد' : 'رد شد' });

    } else {
      return res.status(400).json({ success: false, message: 'نوع نامعتبر' });
    }
  } catch (err) {
    console.error('[Inbox Routes] POST credit action error:', err);
    return res.status(500).json({ success: false, message: 'خطا در انجام عملیات' });
  }
});

// =========================================
// POST /inbox/users/:id/:action
// =========================================
router.post('/inbox/users/:id/:action', requireLogin, enforceStatus, async (req, res) => {
  const user = req.session?.user || null;
  const userId = String(req.params?.id || '').trim();  // ⚠️ UUID as string
  const action = String(req.params?.action || '').trim();

  // ⚠️ CRITICAL: Validate UUID format
  if (!userId || !isValidUUID(userId) || !action) {
    return res.status(400).json({ success: false, message: 'پارامترهای نامعتبر' });
  }

  const isManager = user.manager_id === null;
  if (!isManager && !isSystemAdmin(user)) {
    return res.status(403).json({ success: false, message: 'شما دسترسی ندارید' });
  }

  try {
    // Check if this user is actually pending and assigned to this manager
    const userCheckQuery = await pool.query(
      `SELECT id, status, manager_id 
       FROM users 
       WHERE id = $1::uuid AND status = 'pending_manager'`,
      [userId]
    );

    if (userCheckQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد یا قبلاً تایید شده' });
    }

    const pendingUser = userCheckQuery.rows[0];

    // Check permission
    if (!isSystemAdmin(user) && pendingUser.manager_id !== user.id) {
      return res.status(403).json({ success: false, message: 'شما مدیر این کاربر نیستید' });
    }

    // Execute action
    if (action === 'approve') {
      await pool.query(
        `UPDATE users 
         SET status = 'active', active = TRUE, updated_at = NOW() 
         WHERE id = $1::uuid`,
        [userId]
      );
      return res.json({ success: true, message: 'کاربر تایید شد' });

    } else if (action === 'reject') {
      await pool.query(
        `UPDATE users 
         SET status = 'rejected', active = FALSE, updated_at = NOW() 
         WHERE id = $1::uuid`,
        [userId]
      );
      return res.json({ success: true, message: 'کاربر رد شد' });

    } else if (action === 'request_changes') {
      await pool.query(
        `UPDATE users 
         SET status = 'pending_changes', updated_at = NOW() 
         WHERE id = $1::uuid`,
        [userId]
      );
      return res.json({ success: true, message: 'درخواست ویرایش ارسال شد' });

    } else {
      return res.status(400).json({ success: false, message: 'عملیات نامعتبر' });
    }
  } catch (err) {
    console.error('[Inbox Routes] POST user action error:', err);
    return res.status(500).json({ success: false, message: 'خطا در انجام عملیات' });
  }
});

// =========================================
// GET /tools/credit-sale/my-open
// Backward compatibility redirect
// =========================================
router.get('/tools/credit-sale/my-open', requireLogin, (req, res) => {
  const basePath = getBasePath(req);
  return res.redirect(301, `${basePath}/inbox?category=credit`);
});

// =========================================
// Helper: Update credit sale final status
// =========================================
async function updateCreditSaleFinalStatus(requestId) {
  try {
    const result = await pool.query(
      `SELECT approver1_status, approver2_status, finance_status, finance_required, approver2_node_id
       FROM credit_sale_requests WHERE id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) return;

    const row = result.rows[0];
    let finalStatus = 'pending_approvals';

    // Check if any is rejected
    if (row.approver1_status === 'rejected' || 
        row.approver2_status === 'rejected' || 
        (row.finance_required && row.finance_status === 'rejected')) {
      finalStatus = 'rejected';
    } else {
      // Check if all required approvals are done
      const a1Done = row.approver1_status === 'approved' || row.approver1_status === 'skipped';
      const a2Done = !row.approver2_node_id || row.approver2_status === 'approved' || row.approver2_status === 'skipped';
      const financeDone = !row.finance_required || row.finance_status === 'approved';

      if (a1Done && a2Done && financeDone) {
        finalStatus = 'approved';
      }
    }

    await pool.query(
      `UPDATE credit_sale_requests SET final_status = $1, updated_at = NOW() WHERE id = $2`,
      [finalStatus, requestId]
    );
  } catch (err) {
    console.error('[Inbox Routes] updateCreditSaleFinalStatus error:', err);
  }
}

module.exports = router;
