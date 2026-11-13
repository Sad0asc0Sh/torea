'use strict';

/**
 * Manual test script for automation reminder job
 * Usage: node scripts/test_reminder_job.js
 */

require('dotenv').config();
const reminderJob = require('../src/jobs/automationReminder.job');

async function main() {
  console.log('='.repeat(60));
  console.log('Testing Automation Reminder Job');
  console.log('='.repeat(60));
  console.log('');

  try {
    const result = await reminderJob.runReminderJobNow();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Test Results:');
    console.log(`- Reminders sent: ${result.sent}`);
    console.log(`- Errors: ${result.errors}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('='.repeat(60));
    console.error('Test Failed:', err.message);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
