const assert = require('node:assert/strict');
const { test } = require('node:test');

test('aiSettings.gateway resolves topic with prompts and ensures tables once', async () => {
  const calls = [];
  const mockPool = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM public.ai_api_topics')) {
        return {
          rows: [
            {
              topic_key: 'stt',
              provider_type: 'cloud',
              base_url: 'http://example.com',
              api_key: 'secret-token',
              enabled: true,
              priority: 5,
            },
          ],
        };
      }
      if (sql.includes('FROM public.ai_api_prompts')) {
        return {
          rows: [
            { difficulty: 'simple', prompt: 'simple prompt' },
            { difficulty: 'normal', prompt: 'normal prompt' },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const gateway = require('../../../src/services/aiSettings.gateway');
  gateway.__setPoolForTests(mockPool);
  const resolved = await gateway.resolve('stt', 'simple');

  assert.equal(resolved.provider_type, 'cloud');
  assert.equal(resolved.prompt, 'simple prompt');
  assert.equal(resolved.base_url, 'http://example.com');
  assert.equal(resolved.enabled, true);
  const ensureCalls = calls.filter((sql) => sql.includes('CREATE TABLE IF NOT EXISTS'));
  assert.equal(ensureCalls.length, 2);
  gateway.__setPoolForTests(null);
});
