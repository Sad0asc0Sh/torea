const test = require('node:test');
const assert = require('node:assert');

test('automationReminder service exports expected functions', () => {
  const reminderService = require('../../../src/services/automationReminder.service');
  
  assert.ok(typeof reminderService.findItemsNeedingReminder === 'function', 'findItemsNeedingReminder should be a function');
  assert.ok(typeof reminderService.sendReminderNotification === 'function', 'sendReminderNotification should be a function');
  assert.ok(typeof reminderService.logReminderAction === 'function', 'logReminderAction should be a function');
  assert.ok(typeof reminderService.processReminders === 'function', 'processReminders should be a function');
});

test('automationReminder job exports expected functions', () => {
  const reminderJob = require('../../../src/jobs/automationReminder.job');
  
  assert.ok(typeof reminderJob.startAutomationReminderJob === 'function', 'startAutomationReminderJob should be a function');
  assert.ok(typeof reminderJob.runReminderJobNow === 'function', 'runReminderJobNow should be a function');
});

test('jobs index exports expected functions', () => {
  const jobs = require('../../../src/jobs/index');
  
  assert.ok(typeof jobs.startAllJobs === 'function', 'startAllJobs should be a function');
  assert.ok(typeof jobs.stopAllJobs === 'function', 'stopAllJobs should be a function');
  assert.ok(typeof jobs.automationReminderJob === 'object', 'automationReminderJob should be exported');
});
