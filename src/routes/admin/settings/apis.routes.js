'use strict';

const express = require('express');
const router = express.Router();
const settingsApiService = require('../../../services/settingsApi.service');
const aiSettingsGateway = require('../../../services/aiSettings.gateway');
const {
  safeMsg,
  maskApiKey,
  buildPreview,
  normalizeText,
  safeReadBody,
} = require('./_shared');

const {
  ensure,
  listTopicsWithPrompts,
  upsertTopicAndPrompts,
  toggleTopic,
  testTopic,
  normalizeTopicKey,
  normalizeProviderType,
  normalizePriority,
  normalizeBool,
  trimText,
  fetchWithTimeout,
  HEALTH_TIMEOUT_MS,
  CLOUD_TIMEOUT_MS,
} = settingsApiService;

async function softDisableTopic(req, res, successMessage, errorMessage) {
  const topic_key = normalizeTopicKey(req.body?.topic_key);
  if (!topic_key) return res.status(400).json({ ok: false, error: 'topic_key نامعتبر است.' });
  try {
    const toggled = await toggleTopic(topic_key, false);
    return res.json({ ok: true, enabled: toggled.enabled, message: successMessage });
  } catch (err) {
    console.error(errorMessage || 'soft delete failed:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'غیرفعالسازی انجام نشد.' });
  }
}

router.get('/settings/apis', async (req, res) => {
  try {
    await ensure();
    const topics = await listTopicsWithPrompts();
    const viewTopics = (topics || []).map((t) => ({
      ...t,
      topic_title: t.topic_title || t.topic_key,
      masked_api_key: maskApiKey(t.api_key),
    }));
    return res.render('admin/settings/apis', {
      user: req.session?.user || null,
      topics: viewTopics,
      error: safeMsg(req.query?.err),
      info: safeMsg(req.query?.ok),
    });
  } catch (err) {
    console.error('GET /admin/settings/apis error:', err?.message || err);
    return res.render('admin/settings/apis', {
      user: req.session?.user || null,
      topics: [],
      error: 'خواندن تنظیمات API ناموفق بود.',
      info: null,
    });
  }
});

router.post('/settings/apis/save', async (req, res) => {
  const topic_key = normalizeTopicKey(req.body?.topic_key);
  if (!topic_key) return res.status(400).json({ ok: false, error: 'topic_key نامعتبر است.' });

  const topic_title = trimText(req.body?.topic_title);
  const provider_type = normalizeProviderType(req.body?.provider_type);
  const priority = normalizePriority(req.body?.priority);
  const enabled = normalizeBool(req.body?.enabled ?? true);
  const base_url = trimText(req.body?.base_url);
  const api_key = trimText(req.body?.api_key);

  const prompts = {
    simple: (req.body?.prompt_simple || '').toString(),
    normal: (req.body?.prompt_normal || '').toString(),
    hard: (req.body?.prompt_hard || '').toString(),
  };

  try {
    const saved = await upsertTopicAndPrompts({
      topic_key,
      topic_title,
      provider_type,
      priority,
      enabled,
      base_url,
      api_key,
      prompts,
    });
    return res.json({
      ok: true,
      topic: {
        topic_key: saved.topic_key,
        topic_title: saved.topic_title || saved.topic_key,
        provider_type: saved.provider_type,
        priority: saved.priority,
        enabled: saved.enabled,
        base_url: saved.base_url,
        masked_api_key: maskApiKey(saved.api_key),
      },
    });
  } catch (err) {
    console.error('POST /admin/settings/apis/save failed:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'ذخیره‌سازی انجام نشد.' });
  }
});

router.post('/settings/apis/toggle', async (req, res) => {
  const topic_key = normalizeTopicKey(req.body?.topic_key);
  if (!topic_key) return res.status(400).json({ ok: false, error: 'topic_key نامعتبر است.' });
  const enabled = normalizeBool(req.body?.enabled ?? false);
  try {
    const toggled = await toggleTopic(topic_key, enabled);
    return res.json({ ok: true, enabled: toggled.enabled });
  } catch (err) {
    console.error('POST /admin/settings/apis/toggle failed:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'تغییر وضعیت انجام نشد.' });
  }
});

router.post('/settings/apis/test', async (req, res) => {
  const topic_key = normalizeTopicKey(req.body?.topic_key);
  if (!topic_key) return res.status(400).json({ ok: false, status: 'FAIL', message: 'topic_key نامعتبر است.' });
  const testText = trimText(req.body?.text || req.body?.testText || 'ping');
  try {
    const result = await testTopic(topic_key, testText);
    return res.json(result);
  } catch (err) {
    console.error('POST /admin/settings/apis/test failed:', err?.message || err);
    return res.status(500).json({ ok: false, status: 'FAIL', message: 'آزمایش اتصال انجام نشد.' });
  }
});

router.post('/settings/apis/smoke', async (req, res) => {
  const topic_key = normalizeTopicKey(req.body?.topic_key);
  const level = (req.body?.level || 'normal').toString().toLowerCase();
  const text = trimText(req.body?.text || '');
  if (!topic_key) return res.status(400).json({ ok: false, message: 'topic_key نامعتبر است.', preview: null });

  const fail = (message, preview = null, status = 502) => res.status(status).json({ ok: false, message, preview });
  const pass = (message, preview = null) => res.json({ ok: true, message, preview });

  try {
    const resolved = await aiSettingsGateway.resolve(topic_key, level);
    if (!resolved) return fail('موضوع یافت نشد.', null, 404);
    if (!resolved.enabled) return fail('این API غیرفعال است.', null, 400);

    const provider = normalizeProviderType(resolved.provider_type);
    const baseUrl = trimText(resolved.base_url);
    const apiKey = trimText(resolved.api_key);
    const prompt = resolved.prompt || '';
    const inputText = text || 'ping';

    if (provider === 'local' || provider === 'hybrid') {
      if (!baseUrl) return fail('آدرس سرویس تنظیم نشده است.', null, 400);
      try {
        const url = baseUrl.replace(/\/+$/, '') + '/healthz';
        const resp = await fetchWithTimeout(url, { method: 'GET' }, HEALTH_TIMEOUT_MS);
        if (resp && resp.ok) {
          const body = await safeReadBody(resp);
          return pass('ارتباط با سرویس برقرار است.', body ? buildPreview(body, apiKey) : null);
        }
        const body = await safeReadBody(resp);
        return fail('پاسخ معتبری از سرویس دریافت نشد.', body ? buildPreview(body, apiKey) : null);
      } catch (err) {
        return fail('اتصال به سرویس برقرار نشد.', null);
      }
    }

    if (provider === 'cloud') {
      if (!baseUrl || !apiKey) return fail('base_url یا api_key تنظیم نشده است.', null, 400);
      try {
        const resp = await fetchWithTimeout(
          baseUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ input: inputText, prompt }),
          },
          CLOUD_TIMEOUT_MS
        );
        const body = await safeReadBody(resp);
        if (resp && resp.ok) {
          return pass('اتصال برقرار است.', body ? buildPreview(body, apiKey) : null);
        }
        return fail('پاسخ نامعتبر از سرویس.', body ? buildPreview(body, apiKey) : null);
      } catch (err) {
        return fail('ارتباط با سرویس برقرار نشد.', null);
      }
    }

    return fail('نوع سرویس نامعتبر است.', null, 400);
  } catch (err) {
    console.error('POST /admin/settings/apis/smoke failed:', err?.message || err);
    return res.status(500).json({ ok: false, message: 'آزمایش اتصال انجام نشد.', preview: null });
  }
});

router.post('/settings/apis/delete', async (req, res) => {
  return softDisableTopic(req, res, 'موضوع به صورت غیرفعال ذخیره شد.', 'POST /admin/settings/apis/delete failed:');
});

module.exports = router;
