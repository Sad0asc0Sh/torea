'use strict';

const pool = require('../config/db');
const { getEffectiveCatalogForOrgNode } = require('./catalog.service');

/**
 * ⚠️ CRITICAL NOTES:
 * - user.id is UUID, NOT INTEGER
 * - user.org_node_id is BIGINT
 * - All users table references use UUID
 * - All credit_sale_requests.id are BIGINT
 * - automation_items.id is BIGINT
 */

/**
 * Get all inbox items for a user
 * @param {Object} user - User from session (structure: {id: UUID, org_node_id: BIGINT, role: TEXT, manager_id: UUID})
 * @param {Object} filters - {category: string}
 * @returns {Promise<Array>} Array of inbox items
 */
async function getInboxItems(user, filters = {}) {
  if (!user || !user.id) {
    return [];
  }

  const items = [];
  
  try {
    const isSystemAdmin = String(user.role || '').toUpperCase() === 'SYSTEM_ADMIN';
    const catalog = isSystemAdmin
      ? null
      : await getEffectiveCatalogForOrgNode(user.org_node_id, {
          preferAdminRoutes: false,
        });
    const catalogFlat = catalog?.flat || [];
    const hasAccess = (key) => isSystemAdmin || catalogFlat.some((item) => item.key === key && item.visible === true);

    // 1️⃣ Automation
    if (!filters.category || filters.category === 'automation') {
      if (hasAccess('inbox.automation')) {
        const autoItems = await fetchAutomationInbox(user);
        items.push(...autoItems);
      }
    }

    // 2️⃣ Training
    if (!filters.category || filters.category === 'training') {
      if (hasAccess('inbox.training')) {
        const trainingItems = await fetchTrainingInbox(user);
        items.push(...trainingItems);
      }
    }

    // 3️⃣ Credit
    if (!filters.category || filters.category === 'credit') {
      if (hasAccess('inbox.credit')) {
        const creditItems = await fetchCreditInbox(user);
        items.push(...creditItems);
      }
    }

    // 4️⃣ Users
    if (!filters.category || filters.category === 'users') {
      if (hasAccess('inbox.users')) {
        const userItems = await fetchUserApprovalsInbox(user);
        items.push(...userItems);
      }
    }

    // Sort by newest first
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
  } catch (err) {
    console.error('[Inbox Service] getInboxItems error:', err);
  }

  return items;
}

/**
 * Fetch automation inbox items
 * @param {Object} user - User object with id (UUID), org_node_id (BIGINT), role (TEXT)
 * @returns {Promise<Array>} Array of automation inbox items
 */
async function fetchAutomationInbox(user) {
  const items = [];
  const isSystemAdmin = user.role === 'SYSTEM_ADMIN';

  try {
    // ⚠️ user.id is UUID
    // ⚠️ ai.id is BIGINT
    const query = `
      SELECT DISTINCT
        ai.id,
        ai.item_type,
        ai.topic_id,
        ai.body_text,
        ai.status AS item_status,
        ai.created_at,
        ai.created_by_user_id,
        at.title AS topic_title,
        u.first_name AS creator_first_name,
        u.last_name AS creator_last_name,
        air.status AS recipient_status,
        air.user_id AS recipient_user_id
      FROM automation_items ai
      LEFT JOIN automation_item_recipients air ON air.item_id = ai.id
      LEFT JOIN automation_topics at ON at.id = ai.topic_id
      LEFT JOIN users u ON u.id = ai.created_by_user_id
      WHERE (air.user_id = $1::uuid AND air.status = 'pending')
         OR ($2 = TRUE)
      ORDER BY ai.created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query, [user.id, isSystemAdmin]);

    result.rows.forEach(row => {
      items.push({
        id: `automation_${row.id}`,
        category: 'automation',
        type: `automation_${row.item_type}`,
        title: getAutomationTitle(row),
        body: row.body_text || '',
        created_at: row.created_at,
        priority: 'medium',
        actions: getAutomationActions(row.item_type),
        metadata: {
          entity_type: 'automation_item',
          entity_id: row.id,  // BIGINT
          item_type: row.item_type,
          topic_title: row.topic_title,
          creator: {
            id: row.created_by_user_id,  // UUID
            name: `${row.creator_first_name || ''} ${row.creator_last_name || ''}`.trim()
          },
          recipient_status: row.recipient_status
        }
      });
    });
  } catch (err) {
    console.error('[Inbox Service] fetchAutomationInbox error:', err);
  }

  return items;
}

/**
 * Fetch training inbox items
 * @param {Object} user - User object with id (UUID)
 * @returns {Promise<Array>} Array of training inbox items
 */
async function fetchTrainingInbox(user) {
  const items = [];

  try {
    // ⚠️ user.id is UUID
    // ⚠️ negotiation_analysis_reports.id is BIGINT

    // A) Weakness alerts
    const weaknessQuery = `
      SELECT id, user_id, topic_key, weak_points, created_at
      FROM negotiation_analysis_reports
      WHERE user_id = $1::uuid
        AND weak_points IS NOT NULL
        AND jsonb_array_length(weak_points) > 0
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const weaknessResult = await pool.query(weaknessQuery, [user.id]);

    weaknessResult.rows.forEach(row => {
      let weakPoints = [];
      try {
        weakPoints = typeof row.weak_points === 'string' 
          ? JSON.parse(row.weak_points) 
          : row.weak_points || [];
      } catch (err) {
        console.error('[Inbox Service] Failed to parse weak_points:', err);
        weakPoints = [];
      }

      items.push({
        id: `training_weakness_${row.id}`,
        category: 'training',
        type: 'training_weakness',
        title: 'نقاط ضعف مذاکره شما',
        body: `${weakPoints.length} نقطه ضعف شناسایی شده است.`,
        created_at: row.created_at,
        priority: 'high',
        actions: [
          { key: 'view', label: 'مشاهده جزئیات', style: 'btn-primary', icon: '👁' },
          { key: 'start_exercise', label: 'شروع تمرین', style: 'btn-success', icon: '▶' },
          { key: 'dismiss', label: 'بعداً', style: 'btn-secondary', icon: '⏭' }
        ],
        metadata: {
          entity_type: 'negotiation_analysis_report',
          entity_id: row.id,  // BIGINT
          weak_points: weakPoints
        }
      });
    });

    // B) Exercise recommendations
    const exerciseQuery = `
      SELECT id, user_id, topic_key, exercises, created_at
      FROM negotiation_analysis_reports
      WHERE user_id = $1::uuid
        AND exercises IS NOT NULL
        AND jsonb_array_length(exercises) > 0
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const exerciseResult = await pool.query(exerciseQuery, [user.id]);

    exerciseResult.rows.forEach(row => {
      let exercises = [];
      try {
        exercises = typeof row.exercises === 'string' 
          ? JSON.parse(row.exercises) 
          : row.exercises || [];
      } catch (err) {
        console.error('[Inbox Service] Failed to parse exercises:', err);
        exercises = [];
      }

      items.push({
        id: `training_exercise_${row.id}`,
        category: 'training',
        type: 'training_exercise',
        title: 'تمرین مخصوص شما',
        body: exercises[0] || 'تمرین‌های آموزشی برای شما آماده شده است.',
        created_at: row.created_at,
        priority: 'medium',
        actions: [
          { key: 'start', label: 'شروع', style: 'btn-success', icon: '▶' },
          { key: 'postpone', label: 'به تعویق', style: 'btn-warning', icon: '⏰' },
          { key: 'dismiss', label: 'نادیده گرفتن', style: 'btn-secondary', icon: '✗' }
        ],
        metadata: {
          entity_type: 'negotiation_analysis_report',
          entity_id: row.id,  // BIGINT
          exercises: exercises
        }
      });
    });

    // C) Forgotten strategic products
    const forgottenQuery = `
      SELECT id, user_id, topic_key, missed_strategic_products, created_at
      FROM negotiation_analysis_reports
      WHERE user_id = $1::uuid
        AND missed_strategic_products IS NOT NULL
        AND jsonb_array_length(missed_strategic_products) > 0
        AND created_at > NOW() - INTERVAL '14 days'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const forgottenResult = await pool.query(forgottenQuery, [user.id]);

    forgottenResult.rows.forEach(row => {
      let products = [];
      try {
        products = typeof row.missed_strategic_products === 'string' 
          ? JSON.parse(row.missed_strategic_products) 
          : row.missed_strategic_products || [];
      } catch (err) {
        console.error('[Inbox Service] Failed to parse missed_strategic_products:', err);
        products = [];
      }

      items.push({
        id: `training_forgotten_${row.id}`,
        category: 'training',
        type: 'training_forgotten',
        title: 'کالاهای فراموش‌شده استراتژیک',
        body: `${products.length} محصول استراتژیک را فراموش کرده‌اید.`,
        created_at: row.created_at,
        priority: 'high',
        actions: [
          { key: 'view_tips', label: 'نکات فروش', style: 'btn-primary', icon: '💡' },
          { key: 'start_practice', label: 'تمرین معرفی', style: 'btn-success', icon: '▶' },
          { key: 'acknowledge', label: 'متوجه شدم', style: 'btn-secondary', icon: '✓' }
        ],
        metadata: {
          entity_type: 'negotiation_analysis_report',
          entity_id: row.id,  // BIGINT
          products: products
        }
      });
    });

  } catch (err) {
    console.error('[Inbox Service] fetchTrainingInbox error:', err);
  }

  return items;
}

/**
 * Fetch credit sales inbox items
 * @param {Object} user - User object with id (UUID), org_node_id (BIGINT), role (TEXT)
 * @returns {Promise<Array>} Array of credit inbox items
 */
async function fetchCreditInbox(user) {
  const items = [];
  const isSystemAdmin = user.role === 'SYSTEM_ADMIN';

  try {
    // ⚠️ user.id is UUID
    // ⚠️ user.org_node_id is BIGINT
    // ⚠️ csr.id is BIGINT

    // A) Credit sale approvals
    const creditQuery = `
      SELECT 
        csr.id,
        csr.customer_code,
        csr.customer_name,
        csr.invoice_amount,
        csr.due_date,
        csr.final_status,
        csr.approver1_node_id,
        csr.approver2_node_id,
        csr.approver1_status,
        csr.approver2_status,
        csr.finance_required,
        csr.finance_user_id,
        csr.finance_status,
        csr.created_at,
        s.first_name AS seller_first_name,
        s.last_name AS seller_last_name
      FROM credit_sale_requests csr
      LEFT JOIN users s ON s.id = csr.seller_user_id
      WHERE csr.final_status = 'pending_approvals'
        AND (
          ($1 = csr.approver1_node_id AND csr.approver1_status = 'pending')
          OR ($1 = csr.approver2_node_id AND csr.approver2_status = 'pending')
          OR (csr.finance_required = TRUE AND $2::uuid = csr.finance_user_id AND csr.finance_status = 'pending')
          OR ($3 = TRUE)
        )
      ORDER BY csr.created_at DESC
      LIMIT 50
    `;
    const creditResult = await pool.query(creditQuery, [
      user.org_node_id,  // BIGINT
      user.id,           // UUID
      isSystemAdmin
    ]);

    creditResult.rows.forEach(row => {
      items.push({
        id: `credit_approval_${row.id}`,
        category: 'credit',
        type: 'credit_approval',
        title: `تأیید فروش اعتباری - ${row.customer_name}`,
        body: `مبلغ: ${formatMoney(row.invoice_amount)} تومان | سررسید: ${formatDate(row.due_date)}`,
        created_at: row.created_at,
        priority: 'high',
        actions: [
          { key: 'approve', label: 'تایید', style: 'btn-success', icon: '✓' },
          { key: 'reject', label: 'رد', style: 'btn-danger', icon: '✗' },
          { key: 'forward', label: 'ارجاع', style: 'btn-secondary', icon: '➜' }
        ],
        metadata: {
          entity_type: 'credit_sale_request',
          entity_id: row.id,  // BIGINT
          customer_code: row.customer_code,
          invoice_amount: row.invoice_amount,
          seller: {
            name: `${row.seller_first_name || ''} ${row.seller_last_name || ''}`.trim()
          }
        }
      });
    });

    // B) Settlement approvals
    const settlementQuery = `
      SELECT 
        csr_settlement.id,
        csr_settlement.credit_request_id,
        csr_settlement.settlement_type,
        csr_settlement.settlement_ref_no,
        csr_settlement.notes,
        csr_settlement.status,
        csr_settlement.created_at,
        cr.customer_code,
        cr.customer_name,
        cr.invoice_amount,
        cr.finance_user_id
      FROM credit_settlement_requests csr_settlement
      JOIN credit_sale_requests cr ON cr.id = csr_settlement.credit_request_id
      WHERE csr_settlement.status = 'pending'
        AND (cr.finance_user_id = $1::uuid OR $2 = TRUE)
      ORDER BY csr_settlement.created_at DESC
      LIMIT 50
    `;
    const settlementResult = await pool.query(settlementQuery, [
      user.id,        // UUID
      isSystemAdmin
    ]);

    settlementResult.rows.forEach(row => {
      items.push({
        id: `settlement_approval_${row.id}`,
        category: 'credit',
        type: 'settlement_approval',
        title: `تأیید تسویه - ${row.customer_name}`,
        body: `نوع: ${getSettlementTypeLabel(row.settlement_type)} | شماره: ${row.settlement_ref_no || 'ندارد'}`,
        created_at: row.created_at,
        priority: 'medium',
        actions: [
          { key: 'approve', label: 'تایید تسویه', style: 'btn-success', icon: '✓' },
          { key: 'reject', label: 'رد تسویه', style: 'btn-danger', icon: '✗' },
          { key: 'forward', label: 'ارجاع', style: 'btn-secondary', icon: '➜' }
        ],
        metadata: {
          entity_type: 'credit_settlement_request',
          entity_id: row.id,  // SERIAL/INTEGER
          credit_request_id: row.credit_request_id,  // BIGINT
          settlement_type: row.settlement_type
        }
      });
    });

  } catch (err) {
    console.error('[Inbox Service] fetchCreditInbox error:', err);
  }

  return items;
}

/**
 * Fetch user approvals inbox items
 * @param {Object} user - User object with id (UUID), manager_id (UUID), role (TEXT)
 * @returns {Promise<Array>} Array of user approval inbox items
 */
async function fetchUserApprovalsInbox(user) {
  const items = [];
  const isSystemAdmin = user.role === 'SYSTEM_ADMIN';
  const isManager = user.manager_id === null;

  if (!isManager && !isSystemAdmin) {
    return items;
  }

  try {
    // ⚠️ user.id is UUID
    // ⚠️ u.id is UUID
    const query = `
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.status,
        u.org_node_id,
        u.manager_id,
        u.created_at,
        o.title AS org_node_title,
        m.username AS manager_name
      FROM users u
      LEFT JOIN org_nodes o ON o.id = u.org_node_id
      LEFT JOIN users m ON m.id = u.manager_id
      WHERE u.status = 'pending_manager'
        AND (u.manager_id = $1::uuid OR $2 = TRUE)
      ORDER BY u.created_at ASC
      LIMIT 20
    `;
    const result = await pool.query(query, [user.id, isSystemAdmin]);

    result.rows.forEach(row => {
      items.push({
        id: `user_approval_${row.id}`,
        category: 'users',
        type: 'user_approval',
        title: `تأیید کاربر جدید - ${row.first_name} ${row.last_name}`,
        body: `نام کاربری: ${row.username} | سمت: ${row.org_node_title || 'نامشخص'}`,
        created_at: row.created_at,
        priority: 'high',
        actions: [
          { key: 'approve', label: 'تایید', style: 'btn-success', icon: '✓' },
          { key: 'reject', label: 'رد', style: 'btn-danger', icon: '✗' },
          { key: 'request_changes', label: 'درخواست ویرایش', style: 'btn-warning', icon: '✏' }
        ],
        metadata: {
          entity_type: 'user',
          entity_id: row.id,  // UUID as string
          username: row.username,
          org_node_title: row.org_node_title
        }
      });
    });
  } catch (err) {
    console.error('[Inbox Service] fetchUserApprovalsInbox error:', err);
  }

  return items;
}

// =========================================
// Helper Functions
// =========================================

function getAutomationTitle(row) {
  const typeLabels = {
    'request': 'درخواست',
    'referral': 'ارجاع',
    'announcement': 'اطلاعیه',
    'notification': 'ابلاغ'
  };
  const typeLabel = typeLabels[row.item_type] || 'آیتم';
  const topicTitle = row.topic_title || 'بدون موضوع';
  return `${typeLabel} - ${topicTitle}`;
}

function getAutomationActions(itemType) {
  switch (itemType) {
    case 'request':
      return [
        { key: 'approve', label: 'تایید', style: 'btn-success', icon: '✓' },
        { key: 'reject', label: 'رد', style: 'btn-danger', icon: '✗' },
        { key: 'forward', label: 'ارجاع', style: 'btn-secondary', icon: '➜' }
      ];
    case 'referral':
      return [
        { key: 'acknowledge', label: 'مطلع شدم', style: 'btn-primary', icon: '✓' },
        { key: 'forward', label: 'ارجاع', style: 'btn-secondary', icon: '➜' }
      ];
    case 'announcement':
      return [
        { key: 'read', label: 'خواندم', style: 'btn-primary', icon: '✓' }
      ];
    case 'notification':
      return [
        { key: 'acknowledge', label: 'مطلع شدم', style: 'btn-primary', icon: '✓' },
        { key: 'forward', label: 'ارجاع به زیردست', style: 'btn-secondary', icon: '➜' }
      ];
    default: 
      return [
        { key: 'view', label: 'مشاهده', style: 'btn-primary', icon: '👁' }
      ];
  }
}

function formatMoney(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString('fa-IR');
}

function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('fa-IR');
  } catch (err) {
    return String(date);
  }
}

function getSettlementTypeLabel(type) {
  const labels = {
    'cash': 'نقدی',
    'cheque': 'چک',
    'transfer': 'حواله',
    'other': 'سایر'
  };
  return labels[type] || type;
}

async function getInboxCounts(user) {
  const allItems = await getInboxItems(user);
  return {
    total: allItems.length,
    automation: allItems.filter(i => i.category === 'automation').length,
    training: allItems.filter(i => i.category === 'training').length,
    credit: allItems.filter(i => i.category === 'credit').length,
    users: allItems.filter(i => i.category === 'users').length
  };
}

async function getInboxItemById(itemId, user) {
  const allItems = await getInboxItems(user);
  return allItems.find(item => item.id === itemId) || null;
}

module.exports = {
  getInboxItems,
  getInboxCounts,
  getInboxItemById,
  fetchAutomationInbox,
  fetchTrainingInbox,
  fetchCreditInbox,
  fetchUserApprovalsInbox
};
