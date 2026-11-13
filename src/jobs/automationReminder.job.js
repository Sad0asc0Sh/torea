'use strict';

const cron = require('node-cron');
const automationReminder = require('../services/automationReminder.service');

/**
 * Cron job for 48-hour automation reminders
 * Runs every hour to check for items needing reminders
 * Uses TZ environment variable for timezone (standard practice for cron jobs)
 */
function startAutomationReminderJob() {
  // Run every hour at minute 5 (e.g., 1:05, 2:05, 3:05, etc.)
  const cronExpression = '5 * * * *';

  const job = cron.schedule(cronExpression, async () => {
    const timestamp = new Date().toISOString();
    console.log(`[CRON] Automation reminder job started at ${timestamp}`);

    try {
      const result = await automationReminder.processReminders();
      console.log(`[CRON] Reminder job completed. Sent: ${result.sent}, Errors: ${result.errors}`);
    } catch (err) {
      console.error('[CRON] Reminder job failed:', err);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'Asia/Tehran'
  });

  console.log('[CRON] Automation reminder job registered (runs every hour at :05)');
  
  return job;
}

/**
 * Manual trigger for testing
 */
async function runReminderJobNow() {
  console.log('[MANUAL] Running automation reminder job manually...');
  try {
    const result = await automationReminder.processReminders();
    console.log(`[MANUAL] Job completed. Sent: ${result.sent}, Errors: ${result.errors}`);
    return result;
  } catch (err) {
    console.error('[MANUAL] Job failed:', err);
    throw err;
  }
}

module.exports = {
  startAutomationReminderJob,
  runReminderJobNow
};
