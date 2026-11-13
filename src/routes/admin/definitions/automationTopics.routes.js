'use strict';

const express = require('express');
const automationTopicsService = require('../../../services/automationTopics.service');
const { toBool, toIntOrNull, safeMsg, normalizeTitle } = require('../../../utils/validators');

const router = express.Router();

function topicFromBody(body = {}) {
  return {
    title: normalizeTitle(body.title),
    is_for_request: toBool(body.is_for_request),
    is_for_referral: toBool(body.is_for_referral),
    is_for_announcement: toBool(body.is_for_announcement),
    draft_template: (body.draft_template || '').toString(),
    sort_order: toIntOrNull(body.sort_order) ?? 0,
    is_active: toBool(body.is_active ?? true),
  };
}

router.get('/definitions/automation-topics', async (req, res) => {
  try {
    const topics = await automationTopicsService.listAutomationTopics();
    return res.render('admin/definitions/automation_topics', {
      user: req.session?.user || null,
      topics,
      error: safeMsg(req.query && req.query.err),
      warn: safeMsg(req.query && req.query.warn),
      info: safeMsg(req.query && req.query.ok),
    });
  } catch (err) {
    console.error('GET /admin/definitions/automation-topics error:', err);
    return res.render('admin/definitions/automation_topics', {
      user: req.session?.user || null,
      topics: [],
      error: 'خطا در خواندن لیست سرفصل‌ها.',
      warn: null,
      info: null,
    });
  }
});

router.get('/definitions/automation-topics/new', (req, res) => {
  return res.render('admin/definitions/automation_topic_form', {
    user: req.session?.user || null,
    topic: {
      title: '',
      is_for_request: false,
      is_for_referral: false,
      is_for_announcement: false,
      draft_template: '',
      sort_order: 0,
      is_active: true,
    },
    error: null,
    warn: null,
    info: null,
    mode: 'create',
  });
});

router.get('/definitions/automation-topics/:id/edit', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('شناسه نامعتبر است.'));
  }

  try {
    const topic = await automationTopicsService.getAutomationTopicById(id);
    if (!topic) {
      return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('سرفصل یافت نشد.'));
    }
    return res.render('admin/definitions/automation_topic_form', {
      user: req.session?.user || null,
      topic,
      error: null,
      warn: null,
      info: null,
      mode: 'edit',
    });
  } catch (err) {
    console.error('GET /admin/definitions/automation-topics/:id/edit error:', err);
    return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('خطا در بارگذاری فرم.'));
  }
});

router.post('/definitions/automation-topics', async (req, res) => {
  const payload = topicFromBody(req.body);

  if (!payload.title) {
    return res.render('admin/definitions/automation_topic_form', {
      user: req.session?.user || null,
      topic: payload,
      error: 'عنوان الزامی است.',
      warn: null,
      info: null,
      mode: 'create',
    });
  }

  try {
    await automationTopicsService.createAutomationTopic({
      title: payload.title,
      isForRequest: payload.is_for_request,
      isForReferral: payload.is_for_referral,
      isForAnnouncement: payload.is_for_announcement,
      draftTemplate: payload.draft_template,
      sortOrder: payload.sort_order,
      isActive: payload.is_active,
    });
    return res.redirect('/admin/definitions/automation-topics?ok=' + encodeURIComponent('سرفصل با موفقیت ثبت شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/automation-topics error:', err);
    return res.render('admin/definitions/automation_topic_form', {
      user: req.session?.user || null,
      topic: payload,
      error: 'خطا در ثبت سرفصل.',
      warn: null,
      info: null,
      mode: 'create',
    });
  }
});

router.post('/definitions/automation-topics/:id', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('شناسه نامعتبر است.'));
  }
  const payload = topicFromBody(req.body);

  if (!payload.title) {
    return res.render('admin/definitions/automation_topic_form', {
      user: req.session?.user || null,
      topic: { ...payload, id },
      error: 'عنوان الزامی است.',
      warn: null,
      info: null,
      mode: 'edit',
    });
  }

  try {
    const updated = await automationTopicsService.updateAutomationTopic({
      id,
      title: payload.title,
      isForRequest: payload.is_for_request,
      isForReferral: payload.is_for_referral,
      isForAnnouncement: payload.is_for_announcement,
      draftTemplate: payload.draft_template,
      sortOrder: payload.sort_order,
      isActive: payload.is_active,
    });
    if (!updated) {
      return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('سرفصل یافت نشد.'));
    }
    return res.redirect('/admin/definitions/automation-topics?ok=' + encodeURIComponent('سرفصل به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/automation-topics/:id error:', err);
    return res.render('admin/definitions/automation_topic_form', {
      user: req.session?.user || null,
      topic: { ...payload, id },
      error: 'خطا در به‌روزرسانی سرفصل.',
      warn: null,
      info: null,
      mode: 'edit',
    });
  }
});

router.post('/definitions/automation-topics/:id/toggle', async (req, res) => {
  const id = toIntOrNull(req.params?.id);
  if (!id) {
    return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('شناسه نامعتبر است.'));
  }

  try {
    const updated = await automationTopicsService.toggleAutomationTopicActive(id);
    if (!updated) {
      return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('سرفصل یافت نشد.'));
    }
    return res.redirect('/admin/definitions/automation-topics?ok=' + encodeURIComponent('وضعیت به‌روزرسانی شد.'));
  } catch (err) {
    console.error('POST /admin/definitions/automation-topics/:id/toggle error:', err);
    return res.redirect('/admin/definitions/automation-topics?err=' + encodeURIComponent('خطا در تغییر وضعیت.'));
  }
});

module.exports = router;
