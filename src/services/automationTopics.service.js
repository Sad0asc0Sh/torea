const pool = require('../config/db');

function normalizeSortOrder(raw) {
  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizeBool(raw, defaultValue = false) {
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  return ['1', 'true', 't', 'yes', 'y', 'on'].includes(s);
}

function normalizeTitle(raw) {
  return (raw || '').toString().trim();
}

async function listAutomationTopics() {
  const q = await pool.query(
    `SELECT id, title, is_for_request, is_for_referral, is_for_announcement, draft_template, is_active, sort_order, created_at
     FROM public.automation_topics
     ORDER BY sort_order ASC, id DESC`
  );
  return q.rows || [];
}

async function getAutomationTopicById(id) {
  const q = await pool.query(
    `SELECT id, title, is_for_request, is_for_referral, is_for_announcement, draft_template, is_active, sort_order, created_at
     FROM public.automation_topics
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return q.rows[0] || null;
}

async function createAutomationTopic({
  title,
  isForRequest = false,
  isForReferral = false,
  isForAnnouncement = false,
  draftTemplate = null,
  sortOrder = 0,
  isActive = true,
}) {
  const normalizedTitle = normalizeTitle(title);
  const values = [
    normalizedTitle,
    normalizeBool(isForRequest, false),
    normalizeBool(isForReferral, false),
    normalizeBool(isForAnnouncement, false),
    draftTemplate || null,
    normalizeBool(isActive, true),
    normalizeSortOrder(sortOrder),
  ];
  const q = await pool.query(
    `INSERT INTO public.automation_topics
      (title, is_for_request, is_for_referral, is_for_announcement, draft_template, is_active, sort_order, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING id, title, is_for_request, is_for_referral, is_for_announcement, draft_template, is_active, sort_order, created_at`,
    values
  );
  return q.rows[0] || null;
}

async function updateAutomationTopic({
  id,
  title,
  isForRequest = false,
  isForReferral = false,
  isForAnnouncement = false,
  draftTemplate = null,
  sortOrder = 0,
  isActive = true,
}) {
  const normalizedTitle = normalizeTitle(title);
  const values = [
    normalizedTitle,
    normalizeBool(isForRequest, false),
    normalizeBool(isForReferral, false),
    normalizeBool(isForAnnouncement, false),
    draftTemplate || null,
    normalizeBool(isActive, true),
    normalizeSortOrder(sortOrder),
    id,
  ];
  const q = await pool.query(
    `UPDATE public.automation_topics
      SET title=$1, is_for_request=$2, is_for_referral=$3, is_for_announcement=$4, draft_template=$5, is_active=$6, sort_order=$7
     WHERE id=$8
     RETURNING id, title, is_for_request, is_for_referral, is_for_announcement, draft_template, is_active, sort_order, created_at`,
    values
  );
  return q.rows[0] || null;
}

async function toggleAutomationTopicActive(id) {
  const q = await pool.query(
    `UPDATE public.automation_topics
       SET is_active = NOT is_active
     WHERE id = $1
     RETURNING id, title, is_for_request, is_for_referral, is_for_announcement, draft_template, is_active, sort_order, created_at`,
    [id]
  );
  return q.rows[0] || null;
}

module.exports = {
  listAutomationTopics,
  getAutomationTopicById,
  createAutomationTopic,
  updateAutomationTopic,
  toggleAutomationTopicActive,
};
