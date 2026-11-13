'use strict';

const basePool = require('../config/db');
const {
  ensureSettingsApiTables,
  normalizeTopicKey,
  normalizeProviderType,
  trimText,
} = require('./settingsApi.service');

let poolRef = basePool;
let ensured = false;
let ensurePromise = null;
async function ensureOnce() {
  if (ensured) return;
  if (!ensurePromise) {
    ensurePromise = ensureSettingsApiTables(poolRef)
      .then(() => {
        ensured = true;
      })
      .finally(() => {
        ensurePromise = null;
      });
  }
  return ensurePromise;
}

async function getTopic(topic_key) {
  const key = normalizeTopicKey(topic_key);
  if (!key) return null;
  await ensureOnce();
  const res = await poolRef.query(
    `SELECT topic_key, provider_type, base_url, api_key, enabled, priority
       FROM public.ai_api_topics
      WHERE topic_key = $1
      LIMIT 1`,
    [key]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return {
    ...row,
    provider_type: normalizeProviderType(row.provider_type),
    base_url: trimText(row.base_url),
    api_key: trimText(row.api_key),
  };
}

async function getPrompts(topic_key) {
  const key = normalizeTopicKey(topic_key);
  if (!key) return { simple: '', normal: '', hard: '' };
  await ensureOnce();
  const res = await poolRef.query(
    `SELECT difficulty, prompt
       FROM public.ai_api_prompts
      WHERE topic_key = $1`,
    [key]
  );
  const prompts = { simple: '', normal: '', hard: '' };
  (res.rows || []).forEach((row) => {
    if (row.difficulty === 'simple') prompts.simple = row.prompt || '';
    if (row.difficulty === 'normal') prompts.normal = row.prompt || '';
    if (row.difficulty === 'hard') prompts.hard = row.prompt || '';
  });
  return prompts;
}

async function resolve(topic_key, level = 'normal') {
  const topic = await getTopic(topic_key);
  if (!topic) return null;
  const prompts = await getPrompts(topic_key);
  const lvl = (level || '').toString().toLowerCase();
  const prompt = prompts[lvl] || prompts.normal || prompts.simple || prompts.hard || '';
  return {
    provider_type: topic.provider_type,
    base_url: topic.base_url,
    api_key: topic.api_key,
    enabled: !!topic.enabled,
    priority: topic.priority,
    prompt,
  };
}

async function isEnabled(topic_key) {
  const topic = await getTopic(topic_key);
  return !!(topic && topic.enabled);
}

async function getTopicConfig(topic_key) {
  return getTopic(topic_key);
}

async function getPrompt(topic_key, level = 'normal') {
  const prompts = await getPrompts(topic_key);
  const lvl = (level || '').toString().toLowerCase();
  return prompts[lvl] || prompts.normal || prompts.simple || prompts.hard || '';
}

function __setPoolForTests(customPool) {
  poolRef = customPool || basePool;
  ensured = false;
  ensurePromise = null;
}

module.exports = {
  getTopic,
  getPrompts,
  resolve,
  isEnabled,
  getTopicConfig,
  getPrompt,
  __setPoolForTests,
};
