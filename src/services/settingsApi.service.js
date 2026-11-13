'use strict';

const fetch = require('node-fetch');
const pool = require('../config/db');

const VALID_PROVIDER_TYPES = ['cloud', 'local', 'hybrid'];
const HEALTH_TIMEOUT_MS = 4000;
const CLOUD_TIMEOUT_MS = 5000;

function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const opts = { ...options, signal: controller.signal };
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

async function ensureSettingsApiTables(poolInstance = pool) {
  await poolInstance.query(`
    CREATE TABLE IF NOT EXISTS public.ai_api_topics (
      id SERIAL PRIMARY KEY,
      topic_key VARCHAR(60) UNIQUE NOT NULL,
      topic_title TEXT,
      provider_type VARCHAR(20) NOT NULL DEFAULT 'local',
      api_key TEXT,
      base_url TEXT,
      priority INTEGER NOT NULL DEFAULT 10,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await poolInstance.query(`
    CREATE TABLE IF NOT EXISTS public.ai_api_prompts (
      id SERIAL PRIMARY KEY,
      topic_key VARCHAR(60) NOT NULL REFERENCES public.ai_api_topics(topic_key) ON DELETE CASCADE,
      difficulty VARCHAR(10) NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(topic_key, difficulty)
    );
  `);
}

function normalizeTopicKey(topic_key) {
  const key = (topic_key || '').toString().trim();
  if (!key) return null;
  return /^[a-z0-9_\-]{2,60}$/i.test(key) ? key : null;
}

function normalizeProviderType(v) {
  const val = (v || '').toString().trim().toLowerCase();
  return VALID_PROVIDER_TYPES.includes(val) ? val : 'hybrid';
}

function normalizeTitle(v) {
  const title = trimText(v);
  if (!title) return '';
  return title.length > 120 ? title.slice(0, 120) : title;
}

function normalizePriority(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 10;
  return Math.round(Math.min(99, Math.max(1, n)));
}

function trimText(v) {
  return (v || '').toString().trim();
}

function normalizeBool(v) {
  return v === true || v === 'true' || v === 'on' || v === '1';
}

async function ensure() {
  await ensureSettingsApiTables(pool);
}

async function listTopicsWithPrompts() {
  await ensureSettingsApiTables(pool);
  const topicsRes = await pool.query(
    `SELECT topic_key, topic_title, provider_type, api_key, base_url, enabled, priority, created_at, updated_at
       FROM public.ai_api_topics
      ORDER BY enabled DESC, priority ASC, topic_key ASC`
  );
  const promptsRes = await pool.query(
    `SELECT topic_key, difficulty, prompt
       FROM public.ai_api_prompts`
  );

  const promptsByTopic = {};
  (promptsRes.rows || []).forEach((row) => {
    const key = row.topic_key;
    if (!promptsByTopic[key]) {
      promptsByTopic[key] = { simple: '', normal: '', hard: '' };
    }
    if (row.difficulty === 'simple') promptsByTopic[key].simple = row.prompt || '';
    if (row.difficulty === 'normal') promptsByTopic[key].normal = row.prompt || '';
    if (row.difficulty === 'hard') promptsByTopic[key].hard = row.prompt || '';
  });

  return (topicsRes.rows || []).map((t) => ({
    ...t,
    prompts: promptsByTopic[t.topic_key] || { simple: '', normal: '', hard: '' },
  }));
}

async function getTopic(topic_key) {
  const key = normalizeTopicKey(topic_key);
  if (!key) return null;
  await ensureSettingsApiTables(pool);
  const res = await pool.query(
    `SELECT topic_key, topic_title, provider_type, api_key, base_url, enabled, priority, created_at, updated_at
       FROM public.ai_api_topics
      WHERE topic_key = $1
      LIMIT 1`,
    [key]
  );
  const topic = res.rows[0] || null;
  if (!topic) return null;
  const promptsRes = await pool.query(
    `SELECT difficulty, prompt
       FROM public.ai_api_prompts
      WHERE topic_key = $1`,
    [key]
  );
  const prompts = { simple: '', normal: '', hard: '' };
  (promptsRes.rows || []).forEach((row) => {
    if (row.difficulty === 'simple') prompts.simple = row.prompt || '';
    if (row.difficulty === 'normal') prompts.normal = row.prompt || '';
    if (row.difficulty === 'hard') prompts.hard = row.prompt || '';
  });
  return { ...topic, prompts };
}

async function upsertTopicAndPrompts(payload = {}) {
  const topic_key = normalizeTopicKey(payload.topic_key);
  if (!topic_key) throw new Error('INVALID_TOPIC_KEY');

  const topic_title = normalizeTitle(payload.topic_title);
  const provider_type = normalizeProviderType(payload.provider_type);
  const priority = normalizePriority(payload.priority);
  const enabled = normalizeBool(payload.enabled);
  const base_url = trimText(payload.base_url);
  const api_key = trimText(payload.api_key);

  await ensureSettingsApiTables(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const topicRes = await client.query(
      `INSERT INTO public.ai_api_topics (topic_key, topic_title, provider_type, api_key, base_url, priority, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (topic_key) DO UPDATE
         SET topic_title = EXCLUDED.topic_title,
             provider_type = EXCLUDED.provider_type,
             api_key = EXCLUDED.api_key,
             base_url = EXCLUDED.base_url,
             priority = EXCLUDED.priority,
             enabled = EXCLUDED.enabled,
             updated_at = NOW()
       RETURNING topic_key, topic_title, provider_type, api_key, base_url, priority, enabled`,
      [topic_key, topic_title, provider_type, api_key, base_url, priority, enabled]
    );

    const prompts = payload.prompts || {};
    const promptPairs = [
      { difficulty: 'simple', prompt: (prompts.simple || '').toString() },
      { difficulty: 'normal', prompt: (prompts.normal || '').toString() },
      { difficulty: 'hard', prompt: (prompts.hard || '').toString() },
    ];

    for (const p of promptPairs) {
      await client.query(
        `INSERT INTO public.ai_api_prompts (topic_key, difficulty, prompt, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (topic_key, difficulty) DO UPDATE
           SET prompt = EXCLUDED.prompt,
               updated_at = NOW()`,
        [topic_key, p.difficulty, p.prompt]
      );
    }

    await client.query('COMMIT');
    return topicRes.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function toggleTopic(topic_key, enabled) {
  const key = normalizeTopicKey(topic_key);
  if (!key) throw new Error('INVALID_TOPIC_KEY');
  await ensureSettingsApiTables(pool);
  const res = await pool.query(
    `UPDATE public.ai_api_topics
        SET enabled = $2,
            updated_at = NOW()
      WHERE topic_key = $1
    RETURNING topic_key, enabled`,
    [key, !!enabled]
  );
  if (!res.rows[0]) throw new Error('TOPIC_NOT_FOUND');
  return res.rows[0];
}

async function testTopic(topic_key, testText = 'ping') {
  const topic = await getTopic(topic_key);
  if (!topic) return { ok: false, status: 'FAIL', message: 'موضوع یافت نشد.' };
  if (!topic.enabled) return { ok: false, status: 'FAIL', message: 'این API غیرفعال است.' };

  const provider = normalizeProviderType(topic.provider_type);
  const baseUrl = trimText(topic.base_url);
  const apiKey = trimText(topic.api_key);

  const pass = (message) => ({ ok: true, status: 'PASS', message });
  const fail = (message) => ({ ok: false, status: 'FAIL', message });

  if (provider === 'local' || provider === 'hybrid') {
    if (!baseUrl) return fail('base_url تنظیم نشده است.');
    const healthPaths = ['/healthz', '/health'];
    for (const path of healthPaths) {
      try {
        const res = await fetchWithTimeout(baseUrl.replace(/\/+$/, '') + path, { method: 'GET' }, HEALTH_TIMEOUT_MS);
        if (res && res.status === 200) {
          return pass('ارتباط با سرویس برقرار است.');
        }
      } catch (err) {
        // ignore and try next path
      }
    }
    return fail('پاسخ معتبری از سرویس دریافت نشد.');
  }

  if (provider === 'cloud') {
    if (!baseUrl || !apiKey) return fail('base_url یا api_key تنظیم نشده است.');
    try {
      const res = await fetchWithTimeout(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: testText || 'ping' }),
      }, CLOUD_TIMEOUT_MS);
      if (res && res.status === 200) {
        const txt = await res.text();
        if (txt) return pass('اتصال برقرار است.');
      }
      return fail('پاسخ نامعتبر از سرویس.');
    } catch (err) {
      return fail('ارتباط با سرویس برقرار نشد.');
    }
  }

  return fail('نوع سرویس نامعتبر است.');
}

module.exports = {
  ensure,
  ensureSettingsApiTables,
  fetchWithTimeout,
  HEALTH_TIMEOUT_MS,
  CLOUD_TIMEOUT_MS,
  listTopicsWithPrompts,
  getTopic,
  upsertTopicAndPrompts,
  toggleTopic,
  testTopic,
  normalizeTopicKey,
  normalizeProviderType,
  normalizePriority,
  normalizeBool,
  trimText,
};
