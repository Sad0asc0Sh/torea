'use strict';

const pool = require('../../config/db');

const PLACEHOLDER_NOTE = 'داده‌های واقعی هنوز در دسترس نیست. این داده نمونه است.';

function mockSeries(note = PLACEHOLDER_NOTE) {
  return {
    series: [{ name: 'نمونه', data: [{ x: '2025-01', y: 5 }, { x: '2025-02', y: 3 }] }],
    meta: { note },
  };
}

function scopedUserIds(scope, viewerUser, teamUserIds = []) {
  const normalized = String(scope || '').toUpperCase();
  if (normalized === 'MY') return viewerUser?.id ? [String(viewerUser.id)] : [];
  if (normalized === 'TEAM') return (teamUserIds || []).map(String);
  return null;
}

const BALANCE_USER_COLUMNS = ['seller_user_id', 'requester_user_id', 'finance_user_id'];
const BALANCE_DATE_COLUMNS = ['created_at', 'due_date', 'updated_at'];

function safeColumn(column, allowed, fallback) {
  const col = String(column || '').trim();
  return allowed.includes(col) ? col : fallback;
}

function appendUserFilter(params, ctx, column = 'seller_user_id') {
  const col = safeColumn(column, BALANCE_USER_COLUMNS, 'seller_user_id');
  const ids = scopedUserIds(ctx.scope, ctx.viewerUser, ctx.teamUserIds);
  if (ids === null) return { clause: '', params };
  if (!ids.length) return { clause: ' AND 1=0', params };
  params.push(ids);
  return { clause: ` AND ${col}::text = ANY($${params.length}::text[])`, params };
}

function appendDateFilters(params, from, to, column = 'created_at') {
  const col = safeColumn(column, BALANCE_DATE_COLUMNS, 'created_at');
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

async function withBalanceTable(ctx, tableName, handler) {
  if (!(await ctx.tableExists(tableName))) return mockSeries();
  try {
    return await handler();
  } catch (err) {
    return { series: [], meta: { note: 'error', error: err?.message || String(err) } };
  }
}

function openStatusClause(column = 'final_status') {
  return `(${column} IS NULL OR ${column} NOT IN ('settled','rejected','closed','done'))`;
}

async function myBalanceOpenCount(ctx) {
  return withBalanceTable(ctx, 'credit_sale_requests', async () => {
    let params = [];
    let where = `WHERE ${openStatusClause()}`;
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const date = appendDateFilters(params, ctx.from, ctx.to);
    where += date.clause;
    params = date.params;
    const q = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM credit_sale_requests
      ${where}
      `,
      params
    );
    const row = q.rows[0] || {};
    return { series: [{ name: 'مانده باز', data: [{ x: 'باز', y: Number(row.cnt || 0) }] }], meta: {} };
  });
}

async function balanceAging(ctx) {
  return withBalanceTable(ctx, 'credit_sale_requests', async () => {
    let params = [];
    let where = `WHERE ${openStatusClause()}`;
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE due_date IS NOT NULL AND DATE_PART('day', CURRENT_DATE - due_date) BETWEEN 0 AND 30)::int AS d0_30,
        COUNT(*) FILTER (WHERE due_date IS NOT NULL AND DATE_PART('day', CURRENT_DATE - due_date) BETWEEN 31 AND 60)::int AS d31_60,
        COUNT(*) FILTER (WHERE due_date IS NOT NULL AND DATE_PART('day', CURRENT_DATE - due_date) BETWEEN 61 AND 90)::int AS d61_90,
        COUNT(*) FILTER (WHERE due_date IS NOT NULL AND DATE_PART('day', CURRENT_DATE - due_date) > 90)::int AS d90_plus
      FROM credit_sale_requests
      ${where}
      `,
      params
    );
    const row = q.rows[0] || {};
    return {
      series: [
        {
          name: 'پیرشدگی',
          data: [
            { x: '۰-۳۰ روز', y: Number(row.d0_30 || 0) },
            { x: '۳۱-۶۰ روز', y: Number(row.d31_60 || 0) },
            { x: '۶۱-۹۰ روز', y: Number(row.d61_90 || 0) },
            { x: '۹۰+ روز', y: Number(row.d90_plus || 0) },
          ],
        },
      ],
      meta: {},
    };
  });
}

async function criticalBalances(ctx) {
  return withBalanceTable(ctx, 'credit_sale_requests', async () => {
    let params = [];
    let where = `WHERE ${openStatusClause()}`;
    const user = appendUserFilter(params, ctx);
    where += user.clause;
    params = user.params;
    const q = await pool.query(
      `
      SELECT id, customer_name, invoice_amount
      FROM credit_sale_requests
      ${where}
      ORDER BY invoice_amount DESC NULLS LAST
      LIMIT 5
      `,
      params
    );
    if (!q.rows.length) return mockSeries('no_open_balances');
    return {
      series: [
        {
          name: 'مانده‌های بحرانی',
          data: q.rows.map((r) => ({ x: r.customer_name || `#${r.id}`, y: Number(r.invoice_amount || 0) })),
        },
      ],
      meta: {},
    };
  });
}

async function companyBalanceTrend(ctx) {
  return withBalanceTable(ctx, 'credit_sale_requests', async () => {
    const q = await pool.query(
      `
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS bucket,
             SUM(invoice_amount)::numeric(14,2) AS amt
      FROM credit_sale_requests
      GROUP BY date_trunc('month', created_at)
      ORDER BY bucket ASC
      LIMIT 12
      `
    );
    const data = (q.rows || []).map((r) => ({ x: r.bucket, y: Number(r.amt || 0) }));
    return { series: [{ name: 'روند مانده', data }], meta: {} };
  });
}

async function companyBalanceAging(ctx) {
  return balanceAging({ ...ctx, scope: 'COMPANY' });
}

async function collectionRate(ctx) {
  // Prefer settlements table, fallback to final_status on credit_sale_requests
  if (await ctx.tableExists('credit_settlement_requests')) {
    return withBalanceTable(ctx, 'credit_settlement_requests', async () => {
      const q = await pool.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS collected
        FROM credit_settlement_requests
        `
      );
      const row = q.rows[0] || {};
      const pct =
        Number(row.total || 0) === 0
          ? 0
          : Math.round(((Number(row.collected || 0) / Number(row.total || 1)) * 100) * 10) / 10;
      return { series: [{ name: 'وصول', data: [{ x: 'نرخ', y: pct }] }], meta: {} };
    });
  }
  return withBalanceTable(ctx, 'credit_sale_requests', async () => {
    const q = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE final_status IN ('approved','settled','done'))::int AS collected
      FROM credit_sale_requests
      `
    );
    const row = q.rows[0] || {};
    const pct =
      Number(row.total || 0) === 0
        ? 0
        : Math.round(((Number(row.collected || 0) / Number(row.total || 1)) * 100) * 10) / 10;
    return { series: [{ name: 'وصول', data: [{ x: 'نرخ', y: pct }] }], meta: {} };
  });
}

const BALANCE_HANDLERS = {
  my_balance_open_count: myBalanceOpenCount,
  my_balance_age: balanceAging,
  team_balance_open_count: myBalanceOpenCount,
  team_balance_aging: balanceAging,
  team_critical_balances: criticalBalances,
  company_balance_trend: companyBalanceTrend,
  company_balance_aging: companyBalanceAging,
  company_collection_rate: collectionRate,
};

module.exports = { runBalanceQuery: () => mockSeries(), BALANCE_HANDLERS };
