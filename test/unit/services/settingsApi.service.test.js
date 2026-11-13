const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ensureSettingsApiTables } = require('../../../src/services/settingsApi.service');

test('ensureSettingsApiTables creates topics and prompts tables on provided pool', async () => {
  const calls = [];
  const pool = { query: async (sql) => calls.push(sql) };

  await ensureSettingsApiTables(pool);

  assert.strictEqual(calls.length, 2);
  assert.ok(calls[0].includes('ai_api_topics'));
  assert.ok(calls[1].includes('ai_api_prompts'));
});
