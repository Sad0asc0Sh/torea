'use strict';

const pool = require('../config/db');

/**
 * Find automation items that need 48-hour reminders
 * @returns {Promise<Array>} Items needing reminders
 */
async function findItemsNeedingReminder() {
  const query = `
    SELECT DISTINCT
      ai.id as item_id,
      ai.item_type,
      ai.topic_id,
      ai.created_by_user_id,
      ai.created_at,
      at.title as topic_title,
      air.user_id as recipient_user_id,
      air.status as recipient_status
    FROM automation_items ai
    INNER JOIN automation_item_recipients air ON ai.id = air.item_id
    LEFT JOIN automation_topics at ON ai.topic_id = at.id
    LEFT JOIN automation_item_logs ail ON 
      ail.item_id = ai.id AND 
      ail.action_type = 'reminded_48h' AND
      ail.action_by_user_id = air.user_id
    WHERE 
      ai.status = 'pending'
      AND air.status = 'pending'
      AND ai.created_at < NOW() - INTERVAL '48 hours'
      AND ail.id IS NULL  -- No reminder sent yet to this recipient
    ORDER BY ai.created_at ASC
  `;

  const result = await pool.query(query);
  return result.rows || [];
}

/**
 * Send reminder notification to a recipient
 * @param {number} item_id - Automation item ID
 * @param {number} recipient_user_id - Recipient user ID
 * @param {string} item_type - Type of item
 * @param {string} topic_title - Topic title
 */
async function sendReminderNotification(item_id, recipient_user_id, item_type, topic_title) {
  const typeLabel = item_type === 'request' ? 'درخواست' : 
                     item_type === 'announcement' ? 'ابلاغ' : 'ارجاع';
  
  const title = `یادآوری: ${typeLabel} در انتظار اقدام`;
  const body = `${typeLabel} با موضوع "${topic_title}" در انتظار اقدام شماست. لطفاً هرچه سریعتر بررسی کنید.`;

  await pool.query(`
    INSERT INTO notifications (
      user_id,
      notif_type,
      title,
      body,
      entity_type,
      entity_id,
      is_read,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())
  `, [
    recipient_user_id,
    'automation_reminder',
    title,
    body,
    'automation_item',
    item_id
  ]);
}

/**
 * Log the reminder action
 * Timestamps (action_at, created_at) are automatically set by database DEFAULT values
 * @param {number} item_id - Automation item ID
 * @param {number} recipient_user_id - Recipient who was reminded
 */
async function logReminderAction(item_id, recipient_user_id) {
  await pool.query(`
    INSERT INTO automation_item_logs (
      item_id,
      action_type,
      action_by_user_id,
      note
    ) VALUES ($1, $2, $3, $4)
  `, [
    item_id,
    'reminded_48h',
    recipient_user_id,
    'یادآوری 48 ساعته ارسال شد'
  ]);
}

/**
 * Process all pending reminders
 * Main function to be called by cron job
 * @returns {Promise<{sent: number, errors: number}>}
 */
async function processReminders() {
  console.log('[AutomationReminder] Starting 48-hour reminder check...');
  
  let sentCount = 0;
  let errorCount = 0;

  try {
    const items = await findItemsNeedingReminder();
    
    console.log(`[AutomationReminder] Found ${items.length} items needing reminders`);

    for (const item of items) {
      try {
        // Send notification
        await sendReminderNotification(
          item.item_id,
          item.recipient_user_id,
          item.item_type,
          item.topic_title || 'بدون عنوان'
        );

        // Log the action
        await logReminderAction(item.item_id, item.recipient_user_id);

        sentCount++;
        console.log(`[AutomationReminder] Sent reminder for item ${item.item_id} to user ${item.recipient_user_id}`);
      } catch (err) {
        errorCount++;
        console.error(`[AutomationReminder] Error sending reminder for item ${item.item_id}:`, err.message);
      }
    }

    console.log(`[AutomationReminder] Completed. Sent: ${sentCount}, Errors: ${errorCount}`);
  } catch (err) {
    console.error('[AutomationReminder] Fatal error in processReminders:', err);
    throw err;
  }

  return { sent: sentCount, errors: errorCount };
}

module.exports = {
  findItemsNeedingReminder,
  sendReminderNotification,
  logReminderAction,
  processReminders
};
