'use strict';

const pool = require('../../config/db');

const PLACEHOLDER_NOTE = 'داده‌های واقعی هنوز در دسترس نیست. این داده نمونه است.';

function mockSeries(note = PLACEHOLDER_NOTE) {
  return {
    series: [
      { name: 'نمونه', data: [{ x: '2025-01', y: 5 }, { x: '2025-02', y: 3 }] },
    ],
    meta: { note },
  };
}

function scopedUserIds(scope, viewerUser, teamUserIds = [], rivalUserIds = []) {
  const normalized = String(scope || '').toUpperCase();
  if (normalized === 'MY') return viewerUser?.id ? [String(viewerUser.id)] : [];
  if (normalized === 'TEAM') return (teamUserIds || []).map(String);
  if (normalized === 'RIVALS') return (rivalUserIds || []).map(String);
  return null;
}

const TRAINING_USER_COLUMNS = ['user_id'];
const TRAINING_DATE_COLUMNS = ['created_at', 'updated_at'];

function safeColumn(column, allowed, fallback) {
  const col = String(column || '').trim();
  return allowed.includes(col) ? col : fallback;
}

function appendUserFilter(params, ctx, column = 'user_id') {
  const col = safeColumn(column, TRAINING_USER_COLUMNS, 'user_id');
  const ids = scopedUserIds(ctx.scope, ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds);
  if (ids === null) return { clause: '', params };
  if (!ids.length) return { clause: ' AND 1=0', params };
  params.push(ids);
  return { clause: ` AND ${col}::text = ANY($${params.length}::text[])`, params };
}

function appendDateFilters(params, from, to, column = 'created_at') {
  const col = safeColumn(column, TRAINING_DATE_COLUMNS, 'created_at');
  let clause = '';
  if (from) {
    params.push(from);
    clause += ` AND ${col}::date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    clause += ` AND ${col}::date <= $${params.length}`;
  }
  return { clause, params };
}

async function withTrainingTable(ctx, tableName, handler) {
  if (!(await ctx.tableExists(tableName))) return mockSeries();
  try {
    return await handler();
  } catch (err) {
    return { series: [], meta: { note: 'error', error: err?.message || String(err) } };
  }
}

async function todayFocusScore(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE created_at::date = CURRENT_DATE';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT COALESCE(AVG(score), 0)::numeric(10,2) AS avg_score
      FROM training_scores
      ${where}
      `,
      params
    );
    const score = Number(q.rows[0]?.avg_score || 0);
    return { series: [{ name: 'تمرکز', data: [{ x: 'امروز', y: score }] }], meta: {} };
  });
}

async function trainingProgressPercent(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE score >= 70)::int AS passed
      FROM training_scores
      ${where}
      `,
      params
    );
    const row = q.rows[0] || {};
    const total = Number(row.total || 0);
    const passed = Number(row.passed || 0);
    const pct = total === 0 ? 0 : Math.round(((passed / total) * 100) * 10) / 10;
    return { series: [{ name: 'پیشرفت', data: [{ x: 'پیشرفت', y: pct }] }], meta: {} };
  });
}

async function trainingLevelTimeline(ctx) {
  if (await ctx.tableExists('user_training_state')) {
    return withTrainingTable(ctx, 'user_training_state', async () => {
      let params = [];
      let where = 'WHERE 1=1';
      const user = appendUserFilter(params, ctx, 'user_id');
      where += user.clause;
      params = user.params;
      const q = await pool.query(
        `
        SELECT to_char(updated_at::date, 'YYYY-MM-DD') AS bucket, MAX(user_level)::int AS lvl
        FROM user_training_state
        ${where}
        GROUP BY updated_at::date
        ORDER BY bucket ASC
        LIMIT 20
        `,
        params
      );
      const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.lvl || 0) }));
      return { series: [{ name: 'سطح', data }], meta: {} };
    });
  }
  return mockSeries();
}

async function weakTopics(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT topic_key, AVG(score)::numeric(10,2) AS avg_score
      FROM training_scores
      ${where}
      GROUP BY topic_key
      HAVING topic_key IS NOT NULL
      ORDER BY avg_score ASC
      LIMIT 10
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.topic_key, y: Number(r.avg_score || 0) }));
    return { series: [{ name: 'سرفصل‌های ضعیف', data }], meta: {} };
  });
}

async function practiceCount(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT to_char(created_at::date, 'YYYY-MM-DD') AS bucket, COUNT(*)::int AS cnt
      FROM training_scores
      ${where}
      GROUP BY created_at::date
      ORDER BY bucket ASC
      LIMIT 20
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.cnt || 0) }));
    return { series: [{ name: 'تعداد تمرین', data }], meta: {} };
  });
}

async function practiceScore(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT to_char(created_at::date, 'YYYY-MM-DD') AS bucket, AVG(score)::numeric(10,2) AS avg_score
      FROM training_scores
      ${where}
      GROUP BY created_at::date
      ORDER BY bucket ASC
      LIMIT 20
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.avg_score || 0) }));
    return { series: [{ name: 'میانگین امتیاز', data }], meta: {} };
  });
}

async function teamTrainingAvg(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT COALESCE(AVG(score), 0)::numeric(10,2) AS avg_score
      FROM training_scores
      ${where}
      `,
      params
    );
    const avg = Number(q.rows[0]?.avg_score || 0);
    return { series: [{ name: 'میانگین آموزشی', data: [{ x: 'میانگین', y: avg }] }], meta: {} };
  });
}

async function teamTrainingRanking(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT user_id::text AS uid, AVG(score)::numeric(10,2) AS avg_score
      FROM training_scores
      ${where}
      GROUP BY user_id
      ORDER BY avg_score DESC
      LIMIT 12
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.uid || 'user', y: Number(r.avg_score || 0) }));
    return { series: [{ name: 'رتبه آموزشی', data }], meta: {} };
  });
}

async function teamSkillAverages(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT topic_key, AVG(score)::numeric(10,2) AS avg_score
      FROM training_scores
      ${where}
      GROUP BY topic_key
      ORDER BY avg_score DESC
      LIMIT 12
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.topic_key || 'topic', y: Number(r.avg_score || 0) }));
    return { series: [{ name: 'مهارت', data }], meta: {} };
  });
}

async function rivalsRankTraining(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const params = [peers, String(viewerId)];
    const q = await pool.query(
      `
      WITH stats AS (
        SELECT user_id::text AS uid, AVG(score)::numeric(10,2) AS avg_score
        FROM training_scores
        WHERE user_id::text = ANY($1) OR user_id::text = $2
        GROUP BY user_id
      )
      SELECT uid, avg_score, RANK() OVER (ORDER BY avg_score DESC) AS rnk
      FROM stats
      `,
      params
    );
    const me = (q.rows || []).find((r) => r.uid === String(viewerId));
    const rank = me?.rnk || (q.rows || []).length || 0;
    return { series: [{ name: 'رتبه آموزشی', data: [{ x: 'رتبه', y: Number(rank) }] }], meta: {} };
  });
}

async function rivalsTrainingComparison(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const q = await pool.query(
      `
      SELECT
        AVG(score) FILTER (WHERE user_id::text = $1)::numeric(10,2) AS me_avg,
        AVG(score) FILTER (WHERE user_id::text = ANY($2))::numeric(10,2) AS peers_avg
      FROM training_scores
      WHERE user_id::text = $1 OR user_id::text = ANY($2)
      `,
      [String(viewerId), peers]
    );
    const row = q.rows[0] || {};
    return {
      series: [
        {
          name: 'مقایسه',
          data: [
            { x: 'من', y: Number(row.me_avg || 0) },
            { x: 'میانگین رقبا', y: Number(row.peers_avg || 0) },
          ],
        },
      ],
      meta: {},
    };
  });
}

async function companyTrainingAvg(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    const q = await pool.query(
      `
      SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket,
             AVG(score)::numeric(10,2) AS avg_score
      FROM training_scores
      GROUP BY date_trunc('week', created_at)
      ORDER BY bucket ASC
      LIMIT 16
      `
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.avg_score || 0) }));
    return { series: [{ name: 'میانگین آموزشی', data }], meta: {} };
  });
}

async function companyTrainingDistribution(ctx) {
  if (!(await ctx.tableExists('user_training_state'))) return mockSeries('dataset_empty_training');
  return withTrainingTable(ctx, 'user_training_state', async () => {
    const q = await pool.query(
      `
      SELECT COALESCE(user_level, 0)::text AS lvl, COUNT(*)::int AS cnt
      FROM user_training_state
      GROUP BY user_level
      ORDER BY lvl
      `
    );
    const data = (q.rows || []).map((r) => ({ x: `سطح ${r.lvl}`, y: Number(r.cnt || 0) }));
    return { series: [{ name: 'توزیع سطح', data }], meta: {} };
  });
}

async function companyTrainingParticipation(ctx) {
  return withTrainingTable(ctx, 'training_scores', async () => {
    const q = await pool.query(
      `
      SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket,
             COUNT(DISTINCT user_id)::int AS participants
      FROM training_scores
      GROUP BY date_trunc('week', created_at)
      ORDER BY bucket ASC
      LIMIT 12
      `
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.participants || 0) }));
    return { series: [{ name: 'مشارکت آموزشی', data }], meta: {} };
  });
}

const TRAINING_HANDLERS = {
  my_today_focus_score: todayFocusScore,
  my_training_progress_percent: trainingProgressPercent,
  my_training_level_over_time: trainingLevelTimeline,
  my_weak_topics: weakTopics,
  my_practice_count: practiceCount,
  my_practice_score: practiceScore,
  team_training_avg: teamTrainingAvg,
  team_training_ranking: teamTrainingRanking,
  team_skill_averages: teamSkillAverages,
  rivals_my_rank_training: rivalsRankTraining,
  rivals_training_comparison: rivalsTrainingComparison,
  company_training_avg: companyTrainingAvg,
  company_training_distribution: companyTrainingDistribution,
  company_training_participation: companyTrainingParticipation,
};

module.exports = { runTrainingQuery: () => mockSeries(), TRAINING_HANDLERS };
