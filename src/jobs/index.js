'use strict';

const automationReminderJob = require('./automationReminder.job');

/**
 * Initialize all scheduled jobs
 */
function startAllJobs() {
  console.log('[JOBS] Starting all scheduled jobs...');
  
  // Start automation reminder job
  automationReminderJob.startAutomationReminderJob();
  
  // Add other jobs here as needed
  
  console.log('[JOBS] All jobs started successfully');
}

/**
 * Stop all jobs (for graceful shutdown)
 */
function stopAllJobs() {
  console.log('[JOBS] Stopping all scheduled jobs...');
  // Jobs will be stopped automatically by node-cron on process exit
}

module.exports = {
  startAllJobs,
  stopAllJobs,
  // Export individual job runners for manual testing
  automationReminderJob
};
