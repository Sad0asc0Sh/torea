'use strict';

const pool = require('../../config/db');

const PLACEHOLDER_NOTE = 'داده‌های واقعی هنوز در دسترس نیست. این داده نمونه است.';

function mockSeries(note = PLACEHOLDER_NOTE) {
  return {
    series: [
      {
        name: 'نمونه',
        data: [
          { x: '2025-01', y: 5 },
          { x: '2025-02', y: 3 },
        ],
      },
    ],
    meta: { note },
  };
}

function scopedUserIds(scope, viewerUser, teamUserIds = [], rivalUserIds = []) {
  const normalizedScope = String(scope || '').toUpperCase();
  if (normalizedScope === 'MY') return viewerUser?.id ? [String(viewerUser.id)] : [];
  if (normalizedScope === 'TEAM') return (teamUserIds || []).map(String);
  if (normalizedScope === 'RIVALS') return (rivalUserIds || []).map(String);
  return null;
}

const AUTOMATION_USER_COLUMNS = ['created_by_user_id', 'target_user_id', 'approver_user_id'];
const AUTOMATION_DATE_COLUMNS = ['created_at', 'decided_at'];

function safeColumn(column, allowed, fallback) {
  const col = String(column || '').trim();
  return allowed.includes(col) ? col : fallback;
}

function appendUserFilter(params, ctx, column = 'created_by_user_id') {
  const col = safeColumn(column, AUTOMATION_USER_COLUMNS, 'created_by_user_id');
  const ids = scopedUserIds(ctx.scope, ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds);
  if (ids === null) return { clause: '', params };
  if (!ids.length) return { clause: ' AND 1=0', params };
  params.push(ids);
  return { clause: ` AND ${col}::text = ANY($${params.length}::text[])`, params };
}

function appendDateFilters(params, from, to, column = 'created_at') {
  const col = safeColumn(column, AUTOMATION_DATE_COLUMNS, 'created_at');
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

async function withAutomationTable(ctx, handler) {
  if (!(await ctx.tableExists('automation_items'))) return mockSeries();
  try {
    return await handler();
  } catch (err) {
    return { series: [], meta: { note: 'error', error: err?.message || String(err) } };
  }
}

async function myTodayTasksSummary(ctx) {
  return withAutomationTable(ctx, async () => {
    const params = [];
    let where = 'WHERE created_at::date = CURRENT_DATE';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    const q = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM automation_items
      ${where}
      `,
      user.params
    );
    const row = q.rows[0] || {};
    return {
      series: [
        {
          name: 'کارهای امروز',
          data: [
            { x: 'در انتظار', y: Number(row.pending || 0) },
            { x: 'تأیید', y: Number(row.approved || 0) },
            { x: 'انجام شده', y: Number(row.done || 0) },
            { x: 'رد شده', y: Number(row.rejected || 0) },
          ],
        },
      ],
      meta: {},
    };
  });
}

async function tasksStatus(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    params = date.params;
    where += date.clause;
    const q = await pool.query(
      `
      SELECT status, COUNT(*)::int AS cnt
      FROM automation_items
      ${where}
      GROUP BY status
      ORDER BY status
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.status || 'unknown', y: Number(r.cnt || 0) }));
    return { series: [{ name: 'وضعیت', data }], meta: {} };
  });
}

async function tasksOverTime(ctx) {
  return withAutomationTable(ctx, async () => {
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
      FROM automation_items
      ${where}
      GROUP BY created_at::date
      ORDER BY bucket ASC
      LIMIT 30
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.cnt || 0) }));
    return { series: [{ name: 'روند کارها', data }], meta: {} };
  });
}

async function overdueSeverity(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status <> 'done'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE DATE_PART('day', CURRENT_DATE - created_at::date) BETWEEN 0 AND 3)::int AS d0_3,
        COUNT(*) FILTER (WHERE DATE_PART('day', CURRENT_DATE - created_at::date) BETWEEN 4 AND 7)::int AS d4_7,
        COUNT(*) FILTER (WHERE DATE_PART('day', CURRENT_DATE - created_at::date) BETWEEN 8 AND 14)::int AS d8_14,
        COUNT(*) FILTER (WHERE DATE_PART('day', CURRENT_DATE - created_at::date) > 14)::int AS d15_plus
      FROM automation_items
      ${where}
      `,
      params
    );
    const row = q.rows[0] || {};
    return {
      series: [
        {
          name: 'شدت تأخیر',
          data: [
            { x: '۰-۳ روز', y: Number(row.d0_3 || 0) },
            { x: '۴-۷ روز', y: Number(row.d4_7 || 0) },
            { x: '۸-۱۴ روز', y: Number(row.d8_14 || 0) },
            { x: '۱۵+ روز', y: Number(row.d15_plus || 0) },
          ],
        },
      ],
      meta: {},
    };
  });
}

async function onTimePercent(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status = 'done'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_done,
        COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND decided_at <= created_at + INTERVAL '2 day')::int AS on_time
      FROM automation_items
      ${where}
      `,
      params
    );
    const row = q.rows[0] || {};
    const pct =
      Number(row.total_done || 0) === 0
        ? 0
        : Math.round(((Number(row.on_time || 0) / Number(row.total_done || 1)) * 100) * 10) / 10;
    return { series: [{ name: 'درصد به‌موقع', data: [{ x: 'به‌موقع', y: pct }] }], meta: {} };
  });
}

async function cycleTime(ctx) {
  return withAutomationTable(ctx, async () => {
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
      SELECT to_char(date_trunc('week', COALESCE(decided_at, created_at)), 'YYYY-MM-DD') AS bucket,
             AVG(EXTRACT(EPOCH FROM (COALESCE(decided_at, NOW()) - created_at)) / 3600)::numeric(10,2) AS hours
      FROM automation_items
      ${where}
      GROUP BY date_trunc('week', COALESCE(decided_at, created_at))
      ORDER BY bucket ASC
      LIMIT 16
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.hours || 0) }));
    return { series: [{ name: 'میانگین زمان انجام (ساعت)', data }], meta: {} };
  });
}

async function rejectedCount(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status = 'rejected'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT to_char(created_at, 'YYYY-MM') AS bucket, COUNT(*)::int AS cnt
      FROM automation_items
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT 12
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.cnt || 0) }));
    return { series: [{ name: 'برگشتی', data }], meta: {} };
  });
}

async function activityCount(ctx) {
  return withAutomationTable(ctx, async () => {
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
      FROM automation_items
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT 20
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.cnt || 0) }));
    return { series: [{ name: 'فعالیت', data }], meta: {} };
  });
}

async function activeDays(ctx) {
  return withAutomationTable(ctx, async () => {
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
      FROM automation_items
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT 14
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.cnt > 0 ? 1 : 0) }));
    return { series: [{ name: 'روز فعال', data }], meta: {} };
  });
}

async function urgentActions(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status IN ('pending','approved') AND created_at < NOW() - INTERVAL '3 day'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT id, item_type, created_at, status
      FROM automation_items
      ${where}
      ORDER BY created_at ASC
      LIMIT 5
      `,
      params
    );
    if (!q.rows.length) return mockSeries('هیچ اقدام فوری یافت نشد');
    return {
      series: [
        {
          name: 'اقدامات فوری',
          data: q.rows.map((r) => ({
            x: `#${r.id || ''}`,
            y: 1,
            meta: { created_at: r.created_at, status: r.status, item_type: r.item_type },
          })),
        },
      ],
      meta: {},
    };
  });
}

async function teamMemberCount(ctx) {
  const ids = scopedUserIds('TEAM', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
  if (!ids.length) return mockSeries('team_empty');
  return {
    series: [{ name: 'اعضا', data: [{ x: 'تیم', y: ids.length }] }],
    meta: {},
  };
}

async function teamPerformanceScores(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = 'WHERE 1=1';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT created_by_user_id::text AS uid,
             COUNT(*) FILTER (WHERE status = 'done')::int AS completed,
             COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM automation_items
      ${where}
      GROUP BY created_by_user_id
      ORDER BY completed DESC
      LIMIT 12
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({
      x: r.uid || 'unknown',
      y: Number(r.completed || 0) - Number(r.rejected || 0) * 0.5,
    }));
    return { series: [{ name: 'امتیاز', data }], meta: {} };
  });
}

async function openTasksCount(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status <> 'done'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM automation_items
      ${where}
      `,
      params
    );
    const row = q.rows[0] || {};
    return { series: [{ name: 'باز', data: [{ x: 'باز', y: Number(row.cnt || 0) }] }], meta: {} };
  });
}

async function openTasksByMember(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status <> 'done'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT created_by_user_id::text AS uid, COUNT(*)::int AS cnt
      FROM automation_items
      ${where}
      GROUP BY created_by_user_id
      ORDER BY cnt DESC
      LIMIT 15
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.uid || 'unknown', y: Number(r.cnt || 0) }));
    return { series: [{ name: 'کارهای باز', data }], meta: {} };
  });
}

async function overdueByMember(ctx) {
  return withAutomationTable(ctx, async () => {
    let params = [];
    let where = "WHERE status <> 'done' AND created_at < NOW() - INTERVAL '3 day'";
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT created_by_user_id::text AS uid, COUNT(*)::int AS cnt
      FROM automation_items
      ${where}
      GROUP BY created_by_user_id
      ORDER BY cnt DESC
      LIMIT 15
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.uid || 'unknown', y: Number(r.cnt || 0) }));
    return { series: [{ name: 'عقب‌افتاده', data }], meta: {} };
  });
}

async function rivalsRankPerformance(ctx) {
  return withAutomationTable(ctx, async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const params = [peers, String(viewerId)];
    const q = await pool.query(
      `
      WITH stats AS (
        SELECT created_by_user_id::text AS uid, COUNT(*) FILTER (WHERE status='done')::int AS done_cnt
        FROM automation_items
        WHERE created_by_user_id::text = ANY($1) OR created_by_user_id::text = $2
        GROUP BY created_by_user_id
      )
      SELECT uid, done_cnt, RANK() OVER (ORDER BY done_cnt DESC) AS rnk
      FROM stats
      `,
      params
    );
    const me = (q.rows || []).find((r) => r.uid === String(viewerId));
    const rank = me?.rnk || (q.rows || []).length || 0;
    return { series: [{ name: 'رتبه', data: [{ x: 'رتبه', y: Number(rank) }] }], meta: {} };
  });
}

async function rivalsPerformanceComparison(ctx) {
  return withAutomationTable(ctx, async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const q = await pool.query(
      `
      WITH peer_stats AS (
        SELECT created_by_user_id::text AS uid,
               COUNT(*) FILTER (WHERE status='done')::int AS done_cnt
        FROM automation_items
        WHERE created_by_user_id::text = ANY($1)
        GROUP BY created_by_user_id
      )
      SELECT
        (SELECT COUNT(*) FROM automation_items WHERE created_by_user_id::text = $2 AND status='done') AS me_done,
        COALESCE((SELECT AVG(done_cnt) FROM peer_stats), 0) AS peers_avg
      `,
      [peers, String(viewerId)]
    );
    const row = q.rows[0] || {};
    return {
      series: [
        {
          name: 'مقایسه',
          data: [
            { x: 'من', y: Number(row.me_done || 0) },
            {
              x: 'میانگین رقبا',
              y: Math.round(Number(row.peers_avg || 0) * 10) / 10,
            },
          ],
        },
      ],
      meta: {},
    };
  });
}

async function rivalsQualityComparison(ctx) {
  return withAutomationTable(ctx, async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const q = await pool.query(
      `
      WITH base AS (
        SELECT created_by_user_id::text AS uid,
               COUNT(*) FILTER (WHERE status='done')::int AS done_cnt,
               COUNT(*) FILTER (WHERE status='done' AND decided_at <= created_at + INTERVAL '2 day')::int AS on_time_cnt
        FROM automation_items
        WHERE created_by_user_id::text = $1 OR created_by_user_id::text = ANY($2)
        GROUP BY created_by_user_id
      )
      SELECT
        MAX(CASE WHEN uid = $1 THEN done_cnt END) AS me_done,
        MAX(CASE WHEN uid = $1 THEN on_time_cnt END) AS me_on_time,
        AVG(CASE WHEN uid <> $1 THEN on_time_cnt::numeric / NULLIF(done_cnt,0) END) AS peers_pct
      FROM base
      `,
      [String(viewerId), peers]
    );
    const row = q.rows[0] || {};
    const mePct =
      Number(row.me_done || 0) === 0
        ? 0
        : Math.round(((Number(row.me_on_time || 0) / Number(row.me_done || 1)) * 100) * 10) / 10;
    const peerPct = row.peers_pct ? Math.round(Number(row.peers_pct) * 1000) / 10 : 0;
    return {
      series: [
        {
          name: 'کیفیت',
          data: [
            { x: 'من', y: mePct },
            { x: 'میانگین رقبا', y: peerPct },
          ],
        },
      ],
      meta: {},
    };
  });
}

async function rivalsDailyScore(ctx) {
  return withAutomationTable(ctx, async () => {
    const params = [];
    let where = 'WHERE created_at::date = CURRENT_DATE';
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    const q = await pool.query(
      `
      SELECT COUNT(*) FILTER (WHERE status='done')::int AS done
      FROM automation_items
      ${where}
      `,
      user.params
    );
    const row = q.rows[0] || {};
    const score = Number(row.done || 0);
    return { series: [{ name: 'امتیاز امروز', data: [{ x: 'امتیاز', y: score }] }], meta: {} };
  });
}

async function rivalsTop10(ctx) {
  return withAutomationTable(ctx, async () => {
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!peers.length) return mockSeries('peers_unavailable');
    const params = [peers];
    const q = await pool.query(
      `
      SELECT created_by_user_id::text AS uid, COUNT(*) FILTER (WHERE status='done')::int AS done_cnt
      FROM automation_items
      WHERE created_by_user_id::text = ANY($1)
      GROUP BY created_by_user_id
      ORDER BY done_cnt DESC
      LIMIT 10
      `,
      params
    );
    const data = (q.rows || []).map((r) => ({ x: r.uid || 'peer', y: Number(r.done_cnt || 0) }));
    return { series: [{ name: 'Top 10', data }], meta: {} };
  });
}

async function rivalsTrend(ctx) {
  return withAutomationTable(ctx, async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const q = await pool.query(
      `
      WITH data AS (
        SELECT 'me' AS who,
               to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket,
               COUNT(*) FILTER (WHERE status='done')::int AS val
        FROM automation_items
        WHERE created_by_user_id::text = $1
        GROUP BY bucket
        UNION ALL
        SELECT 'peers' AS who,
               to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS bucket,
               COALESCE(COUNT(*) FILTER (WHERE status='done')::numeric / NULLIF(array_length($2, 1), 0), 0) AS val
        FROM automation_items
        WHERE created_by_user_id::text = ANY($2)
        GROUP BY bucket
      )
      SELECT who, bucket, val
      FROM data
      ORDER BY bucket ASC
      LIMIT 8
      `,
      [String(viewerId), peers]
    );
    const me = [];
    const peersSeries = [];
    for (const row of q.rows || []) {
      const entry = { x: row.bucket, y: Number(row.val || 0) };
      if (row.who === 'me') me.push(entry);
      else peersSeries.push(entry);
    }
    return { series: [{ name: 'من', data: me }, { name: 'میانگین رقبا', data: peersSeries }], meta: {} };
  });
}

async function rivalsWeeklyChallenge(ctx) {
  return withAutomationTable(ctx, async () => {
    const viewerId = ctx.viewerUser?.id;
    const peers = scopedUserIds('RIVALS', ctx.viewerUser, ctx.teamUserIds, ctx.rivalUserIds) || [];
    if (!viewerId || !peers.length) return mockSeries('peers_unavailable');
    const q = await pool.query(
      `
      WITH weekly AS (
        SELECT created_by_user_id::text AS uid,
               COUNT(*) FILTER (WHERE status='done')::int AS done_cnt
        FROM automation_items
        WHERE date_trunc('week', created_at) = date_trunc('week', NOW())
          AND (created_by_user_id::text = $1 OR created_by_user_id::text = ANY($2))
        GROUP BY created_by_user_id
      )
      SELECT
        MAX(CASE WHEN uid = $1 THEN done_cnt END) AS me_done,
        MAX(done_cnt) AS best_done
      FROM weekly
      `,
      [String(viewerId), peers]
    );
    const row = q.rows[0] || {};
    const best = Number(row.best_done || 0) || 1;
    const pct = Math.min(100, Math.round(((Number(row.me_done || 0) / best) * 100) * 10) / 10);
    return { series: [{ name: 'پیشرفت چالش', data: [{ x: 'این هفته', y: pct }] }], meta: {} };
  });
}

async function companyAutomationBacklog(ctx) {
  return withAutomationTable(ctx, async () => {
    const q = await pool.query(
      `
      SELECT COALESCE(topic_id, 0)::text AS topic, COUNT(*)::int AS cnt
      FROM automation_items
      WHERE status <> 'done'
      GROUP BY topic_id
      ORDER BY cnt DESC
      LIMIT 10
      `
    );
    const data = (q.rows || []).map((r) => ({ x: r.topic || 'نامشخص', y: Number(r.cnt || 0) }));
    return { series: [{ name: 'Backlog', data }], meta: {} };
  });
}

async function companyAutomationSla(ctx) {
  return withAutomationTable(ctx, async () => {
    const q = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_done,
        COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND decided_at <= created_at + INTERVAL '2 day')::int AS on_time
      FROM automation_items
      WHERE status = 'done'
      `
    );
    const row = q.rows[0] || {};
    const pct =
      Number(row.total_done || 0) === 0
        ? 0
        : Math.round(((Number(row.on_time || 0) / Number(row.total_done || 1)) * 100) * 10) / 10;
    return { series: [{ name: 'SLA', data: [{ x: 'به‌موقع', y: pct }] }], meta: {} };
  });
}

async function companyAutomationBottlenecks(ctx) {
  return withAutomationTable(ctx, async () => {
    const q = await pool.query(
      `
      SELECT COALESCE(topic_id, 0)::text AS topic,
             AVG(EXTRACT(EPOCH FROM (COALESCE(decided_at, NOW()) - created_at)) / 3600)::numeric(10,2) AS hours
      FROM automation_items
      GROUP BY topic_id
      ORDER BY hours DESC
      LIMIT 10
      `
    );
    const data = (q.rows || []).map((r) => ({ x: r.topic || 'نامشخص', y: Number(r.hours || 0) }));
    return { series: [{ name: 'گلوگاه', data }], meta: {} };
  });
}

async function companyCycleTime(ctx) {
  return cycleTime({ ...ctx, scope: 'COMPANY' });
}

const AUTOMATION_HANDLERS = {
  my_today_tasks_summary: myTodayTasksSummary,
  my_tasks_status: tasksStatus,
  my_tasks_over_time: tasksOverTime,
  my_overdue_tasks_severity: overdueSeverity,
  my_task_quality_on_time: onTimePercent,
  my_task_cycle_time: cycleTime,
  my_task_rejected: rejectedCount,
  my_activity_count: activityCount,
  my_active_days: activeDays,
  my_urgent_actions: urgentActions,
  team_member_count: teamMemberCount,
  team_tasks_on_time_percent: onTimePercent,
  team_performance_scores: teamPerformanceScores,
  team_open_tasks_count: openTasksCount,
  team_open_tasks_by_member: openTasksByMember,
  team_overdue_by_member: overdueByMember,
  team_sla_percent: onTimePercent,
  team_cycle_time: cycleTime,
  team_smart_suggestions: () => mockSeries('پیشنهادات هوشمند به‌زودی فعال می‌شود'),
  rivals_my_rank_performance: rivalsRankPerformance,
  rivals_performance_comparison: rivalsPerformanceComparison,
  rivals_quality_me_vs_avg: rivalsQualityComparison,
  rivals_daily_score: rivalsDailyScore,
  rivals_top_10: rivalsTop10,
  rivals_trend_4weeks: rivalsTrend,
  rivals_weekly_challenge: rivalsWeeklyChallenge,
  company_automation_backlog: companyAutomationBacklog,
  company_automation_sla: companyAutomationSla,
  company_automation_bottlenecks: companyAutomationBottlenecks,
  company_cycle_time: companyCycleTime,
};

module.exports = { runAutomationQuery: () => mockSeries(), AUTOMATION_HANDLERS };
