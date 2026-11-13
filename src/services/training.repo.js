const pool = require('../config/db');

const DEFAULT_SETTINGS = {
  baseline_voices_count: 3,
  rolling_window_n: 3,
  threshold_score: 70,
};

async function getCompanyTrainingSettings() {
  try {
    const res = await pool.query(
      `SELECT baseline_voices_count, rolling_window_n, threshold_score
       FROM public.training_company_settings
       ORDER BY (company_id IS NOT NULL) DESC, created_at DESC
       LIMIT 1`
    );
    return res.rows[0] || { ...DEFAULT_SETTINGS };
  } catch (err) {
    console.warn('[training.repo] getCompanyTrainingSettings fallback to default', err?.message || err);
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveCompanyTrainingSettings({ baseline_voices_count, rolling_window_n, threshold_score }) {
  const values = [baseline_voices_count, rolling_window_n, threshold_score];
  try {
    const updated = await pool.query(
      `UPDATE public.training_company_settings
          SET baseline_voices_count = $1,
              rolling_window_n = $2,
              threshold_score = $3,
              updated_at = NOW()
        WHERE company_id IS NULL
      RETURNING baseline_voices_count, rolling_window_n, threshold_score`,
      values
    );
    if (updated.rows && updated.rows[0]) return updated.rows[0];
  } catch (err) {
    console.error('[training.repo] saveCompanyTrainingSettings update failed, fallback to insert', err?.message || err);
  }

  const inserted = await pool.query(
    `INSERT INTO public.training_company_settings (company_id, baseline_voices_count, rolling_window_n, threshold_score)
     VALUES (NULL, $1, $2, $3)
     RETURNING baseline_voices_count, rolling_window_n, threshold_score`,
    values
  );
  return inserted.rows[0] || { ...DEFAULT_SETTINGS };
}

async function getEnabledTopicsOrdered() {
  const res = await pool.query(
    `SELECT id, company_id, topic_key, title, order_index, is_enabled,
            prompt_simple, prompt_logical, prompt_strict, provider_mode, token, base_url
       FROM public.training_topics
      WHERE is_enabled = TRUE
      ORDER BY COALESCE(order_index, 0) ASC, id ASC`
  );
  return res.rows || [];
}

async function listAllTopics() {
  const res = await pool.query(
    `SELECT id, company_id, topic_key, title, order_index, is_enabled,
            prompt_simple, prompt_logical, prompt_strict, provider_mode, token, base_url
       FROM public.training_topics
      ORDER BY COALESCE(order_index, 0) ASC, id ASC`
  );
  return res.rows || [];
}

async function getTopicById(id) {
  if (!id) return null;
  const res = await pool.query(
    `SELECT id, company_id, topic_key, title, order_index, is_enabled,
            prompt_simple, prompt_logical, prompt_strict, provider_mode, token, base_url
       FROM public.training_topics
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function upsertTrainingTopic(topic = {}) {
  const normalized = {
    topic_key: (topic.topic_key || '').toString().trim(),
    title: (topic.title || '').toString().trim(),
    order_index: Number.isFinite(Number(topic.order_index)) ? Number(topic.order_index) : null,
    is_enabled: !!topic.is_enabled,
    prompt_simple: (topic.prompt_simple || '').toString(),
    prompt_logical: (topic.prompt_logical || '').toString(),
    prompt_strict: (topic.prompt_strict || '').toString(),
    provider_mode: (topic.provider_mode || 'hybrid').toString().trim() || 'hybrid',
    token: (topic.token || '').toString().trim(),
    base_url: (topic.base_url || '').toString().trim(),
  };

  if (topic.id) {
    const res = await pool.query(
      `UPDATE public.training_topics
          SET topic_key = $1,
              title = $2,
              order_index = $3,
              is_enabled = $4,
              prompt_simple = $5,
              prompt_logical = $6,
              prompt_strict = $7,
              provider_mode = $8,
              token = $9,
              base_url = $10,
              updated_at = NOW()
        WHERE id = $11
      RETURNING id, topic_key, title, order_index, is_enabled, provider_mode, token, base_url, prompt_simple, prompt_logical, prompt_strict`,
      [
        normalized.topic_key,
        normalized.title,
        normalized.order_index,
        normalized.is_enabled,
        normalized.prompt_simple,
        normalized.prompt_logical,
        normalized.prompt_strict,
        normalized.provider_mode,
        normalized.token,
        normalized.base_url,
        topic.id,
      ]
    );
    return res.rows[0] || null;
  }

  const res = await pool.query(
    `INSERT INTO public.training_topics
      (company_id, topic_key, title, order_index, is_enabled, prompt_simple, prompt_logical, prompt_strict, provider_mode, token, base_url)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, topic_key, title, order_index, is_enabled, provider_mode, token, base_url, prompt_simple, prompt_logical, prompt_strict`,
    [
      normalized.topic_key,
      normalized.title,
      normalized.order_index,
      normalized.is_enabled,
      normalized.prompt_simple,
      normalized.prompt_logical,
      normalized.prompt_strict,
      normalized.provider_mode,
      normalized.token,
      normalized.base_url,
    ]
  );
  return res.rows[0] || null;
}

async function reorderTopics(orderPairs = []) {
  if (!Array.isArray(orderPairs) || !orderPairs.length) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const pair of orderPairs) {
      const id = Number(pair.id);
      if (!Number.isFinite(id)) continue;
      const ord = Number.isFinite(Number(pair.order_index)) ? Number(pair.order_index) : null;
      await client.query(
        `UPDATE public.training_topics
            SET order_index = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [ord, id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const res = await pool.query(
    `SELECT id, topic_key, order_index
       FROM public.training_topics
      ORDER BY COALESCE(order_index, 0) ASC, id ASC`
  );
  return res.rows || [];
}

async function getUserTrainingState(userId) {
  const res = await pool.query(
    `SELECT user_id, user_level, difficulty_level, baseline_done, baseline_voice_count, current_topic_key, cycle_id
       FROM public.user_training_state
      WHERE user_id = $1
      LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function upsertUserTrainingState(userId, state = {}) {
  const normalized = {
    user_level: Number.isFinite(Number(state.user_level)) ? Number(state.user_level) : 1,
    difficulty_level: state.difficulty_level || null,
    baseline_done: !!state.baseline_done,
    baseline_voice_count: Number.isFinite(Number(state.baseline_voice_count)) ? Number(state.baseline_voice_count) : 0,
    current_topic_key: state.current_topic_key || null,
    cycle_id: Number.isFinite(Number(state.cycle_id)) ? Number(state.cycle_id) : 1,
  };

  const res = await pool.query(
    `INSERT INTO public.user_training_state
       (user_id, user_level, difficulty_level, baseline_done, baseline_voice_count, current_topic_key, cycle_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE
       SET user_level = EXCLUDED.user_level,
           difficulty_level = EXCLUDED.difficulty_level,
           baseline_done = EXCLUDED.baseline_done,
           baseline_voice_count = EXCLUDED.baseline_voice_count,
           current_topic_key = EXCLUDED.current_topic_key,
           cycle_id = EXCLUDED.cycle_id,
           updated_at = NOW()
     RETURNING user_id, user_level, difficulty_level, baseline_done, baseline_voice_count, current_topic_key, cycle_id`,
    [
      userId,
      normalized.user_level,
      normalized.difficulty_level,
      normalized.baseline_done,
      normalized.baseline_voice_count,
      normalized.current_topic_key,
      normalized.cycle_id,
    ]
  );
  return res.rows[0] || normalized;
}

async function insertTrainingScore({ userId, topicKey, score, voiceLogId = null }) {
  const res = await pool.query(
    `INSERT INTO public.training_scores (user_id, topic_key, score, voice_log_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, topic_key, score, voice_log_id, created_at`,
    [userId, topicKey, score, voiceLogId || null]
  );
  return res.rows[0] || null;
}

async function getRollingAverage(userId, topicKey, n = DEFAULT_SETTINGS.rolling_window_n) {
  const limitValue = Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : DEFAULT_SETTINGS.rolling_window_n;
  const res = await pool.query(
    `SELECT AVG(score)::float AS avg_score
       FROM (
         SELECT score
           FROM public.training_scores
          WHERE user_id = $1 AND topic_key = $2
          ORDER BY created_at DESC
          LIMIT $3
       ) AS recent_scores`,
    [userId, topicKey, limitValue]
  );
  const avg = res.rows[0] ? res.rows[0].avg_score : null;
  return avg === null || avg === undefined ? null : Number(avg);
}

async function getAllTopicsStatusForUser(userId, n = DEFAULT_SETTINGS.rolling_window_n, threshold = DEFAULT_SETTINGS.threshold_score) {
  const limitValue = Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : DEFAULT_SETTINGS.rolling_window_n;
  const thresholdValue = Number.isFinite(Number(threshold)) ? Number(threshold) : DEFAULT_SETTINGS.threshold_score;
  const res = await pool.query(
    `SELECT
        t.topic_key,
        (
          SELECT AVG(score)::float
            FROM (
              SELECT score
                FROM public.training_scores s
               WHERE s.user_id = $1 AND s.topic_key = t.topic_key
               ORDER BY s.created_at DESC
               LIMIT $2
            ) AS scores
        ) AS rolling_avg
      FROM public.training_topics t
     WHERE t.is_enabled = TRUE
     ORDER BY COALESCE(t.order_index, 0) ASC, t.id ASC`,
    [userId, limitValue]
  );

  return (res.rows || []).map((row) => {
    const avg = row.rolling_avg === null || row.rolling_avg === undefined ? null : Number(row.rolling_avg);
    return {
      topic_key: row.topic_key,
      rolling_avg: avg,
      met_threshold: avg !== null && avg >= thresholdValue,
    };
  });
}

module.exports = {
  getCompanyTrainingSettings,
  saveCompanyTrainingSettings,
  getEnabledTopicsOrdered,
  listAllTopics,
  getTopicById,
  upsertTrainingTopic,
  reorderTopics,
  getUserTrainingState,
  upsertUserTrainingState,
  insertTrainingScore,
  getRollingAverage,
  getAllTopicsStatusForUser,
  DEFAULT_SETTINGS,
};
