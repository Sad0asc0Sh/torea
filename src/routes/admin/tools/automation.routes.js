'use strict';

const express = require('express');
const pool = require('../../../config/db');
const { fetchSttSettings } = require('../../../services/sttSettings.service');
const automationAi = require('../../../services/automationAi.service');
const { requireSystemAdmin } = require('../../../middlewares/systemAdmin');
const router = express.Router();

// Protect all automation routes with system admin auth
router.use(requireSystemAdmin);

const rewrite = (from, to) => (req, res, next) => {
  if (req.url.startsWith(from)) {
    const suffix = req.url.slice(from.length) || '';
    req.url = `${to}${suffix}`;
  }
  next();
};

router.use('/requests', rewrite('/requests', '/request'));
router.use('/referrals', rewrite('/referrals', '/referral'));
router.use('/announcements', rewrite('/announcements', '/announcement'));

function getUser(req) {
  return (req && req.session && req.session.user) || null;
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function trimText(v) {
  return (v || '').toString().trim();
}

async function fetchTopics(filterColumn) {
  const flag = ['is_for_request', 'is_for_referral', 'is_for_announcement'].includes(filterColumn)
    ? filterColumn
    : null;
  if (!flag) return [];
  try {
    const res = await pool.query(
      `SELECT id, title, draft_template
         FROM automation_topics
        WHERE is_active = TRUE
          AND CASE $1
                WHEN 'is_for_request' THEN is_for_request
                WHEN 'is_for_referral' THEN is_for_referral
                WHEN 'is_for_announcement' THEN is_for_announcement
                ELSE FALSE
              END = TRUE
        ORDER BY sort_order ASC, id ASC`,
      [flag]
    );
    return res.rows || [];
  } catch (err) {
    return [];
  }
}

async function fetchOrgNodes() {
  try {
    const res = await pool.query(
      `SELECT id, title, COALESCE(level, 1) AS level FROM org_nodes ORDER BY COALESCE(level,1), id`
    );
    return res.rows || [];
  } catch (err) {
    return [];
  }
}

async function fetchActiveUsers() {
  try {
    const res = await pool.query(
      `SELECT id,
              first_name,
              last_name,
              CONCAT_WS(' ', first_name, last_name) AS full_name,
              username,
              org_node_id
         FROM users
        ORDER BY full_name NULLS LAST, username ASC`
    );
    return res.rows || [];
  } catch (err) {
    return [];
  }
}

async function addRecipients(itemId, userIds = []) {
  const uniq = Array.from(
    new Set(
      (userIds || [])
        .map((u) => Number(u))
        .filter((u) => Number.isInteger(u) && u > 0)
    )
  );
  if (!uniq.length) return;
  const placeholders = uniq.map((_, idx) => `($1, $${idx + 2})`).join(', ');
  await pool.query(
    `INSERT INTO automation_item_recipients (item_id, user_id) VALUES ${placeholders}`,
    [itemId, ...uniq]
  );
}

async function addNotification(userId, notif_type, title, body, entity_type, entity_id) {
  if (!userId) return;
  await pool.query(
    `INSERT INTO notifications (user_id, notif_type, title, body, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, notif_type, title, body || null, entity_type || null, entity_id || null]
  );
}

async function fetchManagerId(userId) {
  if (!userId) return null;
  try {
    const res = await pool.query('SELECT manager_id FROM users WHERE id = $1 LIMIT 1', [userId]);
    return res.rows[0]?.manager_id || null;
  } catch (err) {
    return null;
  }
}

async function collectOrgSubtreeIds(orgNodeId) {
  if (!orgNodeId) return [];
  try {
    const res = await pool.query(
      `
      WITH RECURSIVE sub AS (
        SELECT id, 1 AS depth FROM org_nodes WHERE id = $1
        UNION ALL
        SELECT o.id, s.depth + 1
          FROM org_nodes o
          JOIN sub s ON o.parent_id = s.id
         WHERE s.depth < 20
      )
      SELECT id FROM sub
    `,
      [orgNodeId]
    );
    return (res.rows || []).map((r) => r.id);
  } catch (err) {
    return [orgNodeId];
  }
}

router.get('/', async (req, res) => {
  return res.render('admin/tools/automation/index', {
    user: getUser(req),
    error: null,
    message: null,
  });
});

async function renderAutomationRequest(req, res) {
  const user = getUser(req);
  const topics = await fetchTopics('is_for_request');
  const stt = await fetchSttSettings();
  const selectedTopicId = toInt(req.query.topic_id) || (topics[0]?.id || null);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  return res.render('admin/tools/automation/request', {
    user,
    topics,
    selectedTopicId,
    draftTemplate: selectedTopic?.draft_template || '',
    error: null,
    message: null,
    sttModelKey: stt.model_default || '',
    voice_path: null,
    transcript_text: null,
  });
}

async function submitAutomationRequest(req, res) {
  const user = getUser(req);
  const topics = await fetchTopics('is_for_request');
  const stt = await fetchSttSettings();
  const selectedTopicId = toInt(req.body.topic_id) || (topics[0]?.id || null);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  if (!user) {
    return res.render('admin/tools/automation/request', {
      user,
      topics,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'کاربر وارد نشده است.',
      message: null,
      sttModelKey: stt.model_default || '',
      voice_path: null,
      transcript_text: null,
    });
  }

  const managerId = await fetchManagerId(user.id);
  if (!managerId) {
    return res.render('admin/tools/automation/request', {
      user,
      topics,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'برای کاربر مدیر بالادستی ثبت نشده است.',
      message: null,
      sttModelKey: stt.model_default || '',
      voice_path: null,
      transcript_text: null,
    });
  }

  const bodyTextRaw = trimText(req.body.body_text) || selectedTopic?.draft_template || '';
  const transcriptText = trimText(req.body.transcript_text) || null;
  const voicePath = trimText(req.body.voice_path) || null;
  const sttModelKey = trimText(req.body.stt_model_key) || stt.model_default || null;

  try {
    const ins = await pool.query(
      `INSERT INTO automation_items
        (item_type, topic_id, created_by_user_id, target_user_id, voice_path, transcript_text, body_text, stt_model_key, status, approver_user_id)
       VALUES
        ('request', $1, $2, $3, $4, $5, $6, $7, 'pending', $4)
       RETURNING id`,
      [selectedTopicId, user.id, managerId, managerId, voicePath || null, transcriptText, bodyTextRaw || null, sttModelKey]
    );
    const itemId = ins.rows[0]?.id;
    await addRecipients(itemId, [user.id, managerId]);
    await addNotification(
      managerId,
      'automation_request',
      'درخواست جدید برای تأیید',
      bodyTextRaw || '',
      'automation_item',
      itemId
    );
    return res.render('admin/tools/automation/request', {
      user,
      topics,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: null,
      message: 'درخواست ثبت شد و برای مدیر بالادست ارسال گردید.',
      sttModelKey,
      voice_path: voicePath || null,
      transcript_text: transcriptText || null,
    });
  } catch (err) {
    return res.render('admin/tools/automation/request', {
      user,
      topics,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'ثبت درخواست با خطا مواجه شد.',
      message: null,
      sttModelKey,
      voice_path: voicePath || null,
      transcript_text: transcriptText || null,
    });
  }
}

router.get('/request', renderAutomationRequest);
router.get('/requests', renderAutomationRequest);
router.post('/request', submitAutomationRequest);
router.post('/requests', submitAutomationRequest);

async function renderAutomationReferral(req, res) {
  const user = getUser(req);
  const topics = await fetchTopics('is_for_referral');
  const stt = await fetchSttSettings();
  const users = await fetchActiveUsers();
  const selectedTopicId = toInt(req.query.topic_id) || (topics[0]?.id || null);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  return res.render('admin/tools/automation/referral', {
    user,
    topics,
    users,
    selectedTopicId,
    draftTemplate: selectedTopic?.draft_template || '',
    error: null,
    message: null,
    sttModelKey: stt.model_default || '',
    targetUserId: null,
    voice_path: null,
    transcript_text: null,
  });
}

async function submitAutomationReferral(req, res) {
  const user = getUser(req);
  const topics = await fetchTopics('is_for_referral');
  const stt = await fetchSttSettings();
  const users = await fetchActiveUsers();
  const selectedTopicId = toInt(req.body.topic_id) || (topics[0]?.id || null);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  const targetUserId = toInt(req.body.target_user_id);

  if (!user) {
    return res.render('admin/tools/automation/referral', {
      user,
      topics,
      users,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'کاربر وارد نشده است.',
      message: null,
      sttModelKey: stt.model_default || '',
      targetUserId,
      voice_path: null,
      transcript_text: null,
    });
  }

  if (!targetUserId) {
    return res.render('admin/tools/automation/referral', {
      user,
      topics,
      users,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'کاربر مقصد انتخاب نشده است.',
      message: null,
      sttModelKey: stt.model_default || '',
      targetUserId,
      voice_path: null,
      transcript_text: null,
    });
  }

  const bodyTextRaw = trimText(req.body.body_text) || selectedTopic?.draft_template || '';
  const transcriptText = trimText(req.body.transcript_text) || null;
  const voicePath = trimText(req.body.voice_path) || null;
  const sttModelKey = trimText(req.body.stt_model_key) || stt.model_default || null;

  try {
    const ins = await pool.query(
      `INSERT INTO automation_items
        (item_type, topic_id, created_by_user_id, target_user_id, voice_path, transcript_text, body_text, stt_model_key, status)
       VALUES
        ('referral', $1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [selectedTopicId, user.id, targetUserId, voicePath || null, transcriptText, bodyTextRaw || null, sttModelKey]
    );
    const itemId = ins.rows[0]?.id;
    await addRecipients(itemId, [targetUserId, user.id]);
    await addNotification(
      targetUserId,
      'automation_referral',
      'ارجاع جدید برای شما ثبت شد',
      bodyTextRaw || '',
      'automation_item',
      itemId
    );
    return res.render('admin/tools/automation/referral', {
      user,
      topics,
      users,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: null,
      message: 'ارجاع ثبت شد و برای کاربر انتخاب‌شده ارسال گردید.',
      sttModelKey,
      targetUserId,
      voice_path: voicePath || null,
      transcript_text: transcriptText || null,
    });
  } catch (err) {
    return res.render('admin/tools/automation/referral', {
      user,
      topics,
      users,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'ثبت ارجاع با خطا مواجه شد.',
      message: null,
      sttModelKey,
      targetUserId,
      voice_path: voicePath || null,
      transcript_text: transcriptText || null,
    });
  }
}

router.get('/referral', renderAutomationReferral);
router.get('/referrals', renderAutomationReferral);
router.post('/referral', submitAutomationReferral);
router.post('/referrals', submitAutomationReferral);

async function renderAutomationAnnouncement(req, res) {
  const user = getUser(req);
  const topics = await fetchTopics('is_for_announcement');
  const stt = await fetchSttSettings();
  const users = await fetchActiveUsers();
  const orgNodes = await fetchOrgNodes();
  const selectedTopicId = toInt(req.query.topic_id) || (topics[0]?.id || null);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  return res.render('admin/tools/automation/announcement', {
    user,
    topics,
    users,
    orgNodes,
    selectedTopicId,
    draftTemplate: selectedTopic?.draft_template || '',
    error: null,
    message: null,
    sttModelKey: stt.model_default || '',
    targetUserId: null,
    targetOrgNodeId: null,
    voice_path: null,
    transcript_text: null,
  });
}

async function submitAutomationAnnouncement(req, res) {
  const user = getUser(req);
  const topics = await fetchTopics('is_for_announcement');
  const stt = await fetchSttSettings();
  const users = await fetchActiveUsers();
  const orgNodes = await fetchOrgNodes();
  const selectedTopicId = toInt(req.body.topic_id) || (topics[0]?.id || null);
  const selectedTopic = topics.find((t) => t.id === selectedTopicId) || null;
  let targetUserId = toInt(req.body.target_user_id);
  let targetOrgNodeId = toInt(req.body.target_org_node_id);

  if (!user) {
    return res.render('admin/tools/automation/announcement', {
      user,
      topics,
      users,
      orgNodes,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'کاربر وارد نشده است.',
      message: null,
      sttModelKey: stt.model_default || '',
      targetUserId,
      targetOrgNodeId,
      voice_path: null,
      transcript_text: null,
    });
  }

  if (!targetOrgNodeId && targetUserId) {
    try {
      const resUser = await pool.query('SELECT org_node_id FROM users WHERE id = $1 LIMIT 1', [targetUserId]);
      targetOrgNodeId = resUser.rows[0]?.org_node_id || null;
    } catch (err) {
      targetOrgNodeId = null;
    }
  }

  if (!targetOrgNodeId && !targetUserId) {
    return res.render('admin/tools/automation/announcement', {
      user,
      topics,
      users,
      orgNodes,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'باید کاربر ریشه یا سمت سازمانی را انتخاب کنید.',
      message: null,
      sttModelKey: stt.model_default || '',
      targetUserId,
      targetOrgNodeId,
      voice_path: null,
      transcript_text: null,
    });
  }

  const bodyTextRaw = trimText(req.body.body_text) || selectedTopic?.draft_template || '';
  const transcriptText = trimText(req.body.transcript_text) || null;
  const voicePath = trimText(req.body.voice_path) || null;
  const sttModelKey = trimText(req.body.stt_model_key) || stt.model_default || null;

  let recipientIds = [];
  if (targetOrgNodeId) {
    const nodeIds = await collectOrgSubtreeIds(targetOrgNodeId);
    if (nodeIds.length) {
      const resUsers = await pool.query(
        `SELECT id FROM users WHERE org_node_id = ANY($1::int[])`,
        [nodeIds]
      );
      recipientIds = (resUsers.rows || []).map((r) => r.id);
    }
  }
  if (targetUserId) recipientIds.push(targetUserId);
  recipientIds.push(user.id);
  recipientIds = Array.from(new Set(recipientIds.filter(Boolean)));

  try {
    const ins = await pool.query(
      `INSERT INTO automation_items
        (item_type, topic_id, created_by_user_id, target_user_id, target_org_node_id, voice_path, transcript_text, body_text, stt_model_key, status)
       VALUES
        ('announcement', $1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id`,
      [
        selectedTopicId,
        user.id,
        targetUserId || null,
        targetOrgNodeId || null,
        voicePath || null,
        transcriptText,
        bodyTextRaw || null,
        sttModelKey,
      ]
    );
    const itemId = ins.rows[0]?.id;
    await addRecipients(itemId, recipientIds);
    for (const uid of recipientIds) {
      await addNotification(
        uid,
        'automation_announcement',
        'ابلاغ جدید',
        bodyTextRaw || '',
        'automation_item',
        itemId
      );
    }
    return res.render('admin/tools/automation/announcement', {
      user,
      topics,
      users,
      orgNodes,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: null,
      message: 'ابلاغ ثبت شد و برای مخاطبین ارسال گردید.',
      sttModelKey,
      targetUserId,
      targetOrgNodeId,
      voice_path: voicePath || null,
      transcript_text: transcriptText || null,
    });
  } catch (err) {
    return res.render('admin/tools/automation/announcement', {
      user,
      topics,
      users,
      orgNodes,
      selectedTopicId,
      draftTemplate: selectedTopic?.draft_template || '',
      error: 'ثبت ابلاغ با خطا مواجه شد.',
      message: null,
      sttModelKey,
      targetUserId,
      targetOrgNodeId,
      voice_path: voicePath || null,
      transcript_text: transcriptText || null,
    });
  }
}

router.get('/announcement', renderAutomationAnnouncement);
router.get('/announcements', renderAutomationAnnouncement);
router.post('/announcement', submitAutomationAnnouncement);
router.post('/announcements', submitAutomationAnnouncement);

/**
 * POST /admin/tools/office-automation/ai/format
 * Format transcript text using AI based on topic and item type
 */
router.post('/office-automation/ai/format', async (req, res) => {
  try {
    const topic_id = parseInt(req.body.topic_id, 10);
    const transcript_text = (req.body.transcript_text || '').toString().trim();
    const item_type = (req.body.item_type || 'request').toString().trim().toLowerCase();
    
    // Validation
    if (!topic_id || isNaN(topic_id)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'INVALID_TOPIC_ID',
        message: 'topic_id الزامی است و باید عدد باشد' 
      });
    }

    if (!transcript_text) {
      return res.status(400).json({ 
        ok: false, 
        error: 'EMPTY_TRANSCRIPT',
        message: 'transcript_text الزامی است' 
      });
    }

    if (!['request', 'announcement', 'referral'].includes(item_type)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'INVALID_ITEM_TYPE',
        message: 'item_type باید یکی از: request, announcement, referral باشد' 
      });
    }

    // Process with AI
    const result = await automationAi.processAutomationTranscript({ 
      topic_id, 
      transcript_text, 
      item_type 
    });
    
    return res.json({ 
      ok: true, 
      formatted_text: result.formatted_text 
    });
    
  } catch (err) {
    console.error('POST /office-automation/ai/format error:', err);
    
    if (err.code === 'TOPIC_NOT_FOUND') {
      return res.status(404).json({ 
        ok: false, 
        error: err.code,
        message: 'موضوع یافت نشد' 
      });
    }
    
    return res.status(500).json({ 
      ok: false, 
      error: 'AI_PROCESSING_FAILED',
      message: 'خطا در پردازش متن با هوش مصنوعی' 
    });
  }
});

module.exports = router;
