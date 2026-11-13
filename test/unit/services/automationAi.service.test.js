const assert = require('node:assert/strict');
const { test } = require('node:test');

test('automationAi.service returns original text when AI is disabled', async () => {
  const calls = [];
  const mockPool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      
      // Mock topic query
      if (sql.includes('FROM automation_topics')) {
        return {
          rows: [
            {
              id: 1,
              title: 'درخواست مرخصی',
              draft_template: 'قالب درخواست'
            }
          ]
        };
      }
      
      // Mock AI settings query - disabled
      if (sql.includes('FROM automation_ai_settings')) {
        return {
          rows: [
            {
              id: 1,
              provider_type: 'local',
              base_url: 'http://localhost:11434/api/generate',
              enabled: false,
              max_tokens: 500,
              temperature: 0.7,
              timeout_seconds: 30
            }
          ]
        };
      }
      
      return { rows: [] };
    }
  };

  // Mock the pool in the module
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === '../config/db') {
      return mockPool;
    }
    return originalRequire.apply(this, arguments);
  };

  // Clear cache to ensure fresh module load
  delete require.cache[require.resolve('../../../src/services/automationAi.service')];
  const automationAi = require('../../../src/services/automationAi.service');

  const result = await automationAi.processAutomationTranscript({
    topic_id: 1,
    transcript_text: 'متن اصلی تست',
    item_type: 'request'
  });

  assert.equal(result.formatted_text, 'متن اصلی تست');
  
  // Verify topic was queried
  const topicCalls = calls.filter(c => c.sql.includes('FROM automation_topics'));
  assert.equal(topicCalls.length, 1);
  
  // Verify settings were queried
  const settingsCalls = calls.filter(c => c.sql.includes('FROM automation_ai_settings'));
  assert.equal(settingsCalls.length, 1);

  // Restore original require
  Module.prototype.require = originalRequire;
});

test('automationAi.service throws error when topic not found', async () => {
  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes('FROM automation_topics')) {
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === '../config/db') {
      return mockPool;
    }
    return originalRequire.apply(this, arguments);
  };

  delete require.cache[require.resolve('../../../src/services/automationAi.service')];
  const automationAi = require('../../../src/services/automationAi.service');

  await assert.rejects(
    async () => {
      await automationAi.processAutomationTranscript({
        topic_id: 999,
        transcript_text: 'متن تست',
        item_type: 'request'
      });
    },
    (err) => {
      assert.equal(err.code, 'TOPIC_NOT_FOUND');
      assert.equal(err.message, 'موضوع یافت نشد');
      return true;
    }
  );

  Module.prototype.require = originalRequire;
});

test('automationAi.service returns original text when no prompt template found', async () => {
  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes('FROM automation_topics')) {
        return {
          rows: [
            {
              id: 1,
              title: 'درخواست مرخصی',
              draft_template: 'قالب درخواست'
            }
          ]
        };
      }
      
      if (sql.includes('FROM automation_ai_settings')) {
        return {
          rows: [
            {
              id: 1,
              provider_type: 'local',
              base_url: 'http://localhost:11434/api/generate',
              enabled: true,
              max_tokens: 500,
              temperature: 0.7,
              timeout_seconds: 30
            }
          ]
        };
      }
      
      // No prompt template found
      if (sql.includes('FROM automation_ai_prompts')) {
        return { rows: [] };
      }
      
      return { rows: [] };
    }
  };

  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === '../config/db') {
      return mockPool;
    }
    return originalRequire.apply(this, arguments);
  };

  delete require.cache[require.resolve('../../../src/services/automationAi.service')];
  const automationAi = require('../../../src/services/automationAi.service');

  const result = await automationAi.processAutomationTranscript({
    topic_id: 1,
    transcript_text: 'متن اصلی تست',
    item_type: 'request'
  });

  assert.equal(result.formatted_text, 'متن اصلی تست');

  Module.prototype.require = originalRequire;
});
