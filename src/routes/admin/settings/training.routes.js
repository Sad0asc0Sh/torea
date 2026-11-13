'use strict';

const express = require('express');
const router = express.Router();
const trainingRepo = require('../../../services/training.repo');
const aiGateway = require('../../../services/ai.gateway');
const {
  toBool,
  toIntOrNull,
  renderSettingsPage,
  normalizeText,
  normalizeProviderMode,
} = require('./_shared');

router.get('/settings/training-config', async (req, res) => {
  try {
    const settings = await trainingRepo.getCompanyTrainingSettings();
    return renderSettingsPage(req, res, 'admin/settings/training_config', { settings });
  } catch (err) {
    console.error('GET /admin/settings/training-config error:', err);
    return renderSettingsPage(req, res, 'admin/settings/training_config', {
      settings: trainingRepo.DEFAULT_SETTINGS,
      error: 'خطا در خواندن تنظیمات.',
      warn: null,
      info: null,
    });
  }
});

router.post('/settings/training-config', async (req, res) => {
  const baseline = toIntOrNull(req.body?.baseline_voices_count);
  const rolling = toIntOrNull(req.body?.rolling_window_n);
  const threshold = toIntOrNull(req.body?.threshold_score);

  const settings = {
    baseline_voices_count: baseline && baseline > 0 ? baseline : trainingRepo.DEFAULT_SETTINGS.baseline_voices_count,
    rolling_window_n: rolling && rolling > 0 ? rolling : trainingRepo.DEFAULT_SETTINGS.rolling_window_n,
    threshold_score:
      threshold && threshold >= 0 && threshold <= 100 ? threshold : trainingRepo.DEFAULT_SETTINGS.threshold_score,
  };

  try {
    await trainingRepo.saveCompanyTrainingSettings(settings);
    return res.redirect('/admin/settings/training-config?ok=' + encodeURIComponent('تنظیمات ذخیره‌سازی شد.'));
  } catch (err) {
    console.error('POST /admin/settings/training-config error:', err);
    return res.render('admin/settings/training_config', {
      user: req.session?.user || null,
      settings,
      error: 'ذخیره‌سازی تنظیمات انجام نشد.',
      warn: null,
      info: null,
    });
  }
});

router.get('/settings/training-topics', async (req, res) => {
  try {
    const [topics, settings] = await Promise.all([
      trainingRepo.listAllTopics(),
      trainingRepo.getCompanyTrainingSettings(),
    ]);
    return renderSettingsPage(req, res, 'admin/settings/training_topics', { topics, settings });
  } catch (err) {
    console.error('GET /admin/settings/training-topics error:', err);
    return renderSettingsPage(req, res, 'admin/settings/training_topics', {
      topics: [],
      settings: trainingRepo.DEFAULT_SETTINGS,
      error: 'خطا در خواندن موضوعات.',
      warn: null,
      info: null,
    });
  }
});

router.post('/settings/training-topics', async (req, res) => {
  const id = toIntOrNull(req.body?.id);
  const topic_key = normalizeText(req.body?.topic_key);
  const title = normalizeText(req.body?.title);
  const order_index = toIntOrNull(req.body?.order_index);
  const is_enabled = toBool(req.body?.is_enabled ?? true);
  const provider_mode = normalizeProviderMode(req.body?.provider_mode);
  const prompt_simple = (req.body?.prompt_simple || '').toString();
  const prompt_logical = (req.body?.prompt_logical || '').toString();
  const prompt_strict = (req.body?.prompt_strict || '').toString();
  const token = normalizeText(req.body?.token);
  const base_url = normalizeText(req.body?.base_url);

  if (!topic_key || !title) {
    const [topics, settings] = await Promise.all([
      trainingRepo.listAllTopics(),
      trainingRepo.getCompanyTrainingSettings(),
    ]);
    return res.render('admin/settings/training_topics', {
      user: req.session?.user || null,
      topics,
      settings,
      error: 'عنوان و کلید موضوع الزامی است.',
      warn: null,
      info: null,
    });
  }

  try {
    await trainingRepo.upsertTrainingTopic({
      id,
      topic_key,
      title,
      order_index,
      is_enabled,
      provider_mode,
      prompt_simple,
      prompt_logical,
      prompt_strict,
      token,
      base_url,
    });
    const msg = id ? 'موضوع به‌روزرسانی شد.' : 'موضوع جدید ثبت شد.';
    return res.redirect('/admin/settings/training-topics?ok=' + encodeURIComponent(msg));
  } catch (err) {
    console.error('POST /admin/settings/training-topics error:', err);
    const dup = err && err.code === '23505';
    const [topics, settings] = await Promise.all([
      trainingRepo.listAllTopics(),
      trainingRepo.getCompanyTrainingSettings(),
    ]);
    return res.render('admin/settings/training_topics', {
      user: req.session?.user || null,
      topics,
      settings,
      error: dup ? 'کلید موضوع تکراری است.' : 'ذخیره‌سازی موضوع انجام نشد.',
      warn: null,
      info: null,
    });
  }
});

router.post('/settings/training-topics/reorder', async (req, res) => {
  const ids = Array.isArray(req.body?.topic_id) ? req.body.topic_id : req.body?.topic_id ? [req.body.topic_id] : [];
  const orders = Array.isArray(req.body?.order_index)
    ? req.body.order_index
    : req.body?.order_index
    ? [req.body.order_index]
    : [];

  const pairs = [];
  ids.forEach((idVal, idx) => {
    const id = toIntOrNull(idVal);
    if (!id) return;
    const ord = toIntOrNull(orders[idx]);
    pairs.push({ id, order_index: ord });
  });

  if (!pairs.length) {
    return res.redirect('/admin/settings/training-topics?warn=' + encodeURIComponent('ترتیب جدیدی ارسال نشد.'));
  }

  try {
    await trainingRepo.reorderTopics(pairs);
    return res.redirect('/admin/settings/training-topics?ok=' + encodeURIComponent('ترتیب ثبت شد.'));
  } catch (err) {
    console.error('POST /admin/settings/training-topics/reorder error:', err);
    return res.redirect('/admin/settings/training-topics?err=' + encodeURIComponent('ثبت ترتیب انجام نشد.'));
  }
});

router.post('/settings/training-topics/test', async (req, res) => {
  const topicId = toIntOrNull(req.body?.topic_id);
  if (!topicId) {
    return res.redirect('/admin/settings/training-topics?warn=' + encodeURIComponent('موضوع نامعتبر است.'));
  }

  try {
    const topic = await trainingRepo.getTopicById(topicId);
    if (!topic) {
      return res.redirect('/admin/settings/training-topics?err=' + encodeURIComponent('موضوع یافت نشد.'));
    }

    const sample =
      normalizeText(req.body?.sample) ||
      'نمونه مکالمه تست تامین‌کننده برای بررسی پاسخ‌دهی و امتیازدهی سریع در محیط مدیریت.';
    const difficulty = normalizeText(req.body?.difficulty_level) || 'simple';
    const result = await aiGateway.analyzeTranscript({ transcript: sample, topic, difficulty_level: difficulty });

    if (result?.error === 'missing_provider_token') {
      return res.redirect(
        '/admin/settings/training-topics?warn=' + encodeURIComponent('توکن یا آدرس سرویس برای این تامین‌کننده تنظیم نشده است.')
      );
    }

    const providerLabel = result?.provider || 'local';
    const scoreLabel = Number.isFinite(result?.score) ? ` | امتیاز نمونه: ${result.score}` : '';
    return res.redirect(
      '/admin/settings/training-topics?ok=' + encodeURIComponent(`پاسخ‌دهنده (${providerLabel}) در دسترس است${scoreLabel}.`)
    );
  } catch (err) {
    console.error('POST /admin/settings/training-topics/test error:', err);
    return res.redirect('/admin/settings/training-topics?err=' + encodeURIComponent('تست تامین‌کننده ناموفق بود.'));
  }
});

module.exports = router;
