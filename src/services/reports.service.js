'use strict';

const pool = require('../config/db');
const { defaultReports } = require('../reports/reportCatalog');

const GROUP_KEY_MAP = {
  MY: 'my',
  TEAM: 'team',
  RIVALS: 'rivals',
  COMPANY: 'company',
};

function normalizeReport(raw) {
  const scope = String(raw.scope || '').toUpperCase();
  const group_key = raw.group_key || GROUP_KEY_MAP[scope] || 'my';
  return {
    key: String(raw.key),
    title: raw.title || raw.key,
    description: raw.description || null,
    scope,
    group_key,
    order_index: Number.isFinite(raw.order_index) ? raw.order_index : parseInt(raw.order_index || 0, 10) || 0,
    is_active: raw.is_active !== false,
    sources: Array.isArray(raw.sources) ? raw.sources.map(String) : [],
    config: raw.config || {},
    widgets: Array.isArray(raw.widgets) ? raw.widgets : [],
  };
}

function listReportsFromCode() {
  return (defaultReports || []).map(normalizeReport);
}

async function syncReportsToDatabase(logger = console) {
  const items = listReportsFromCode();
  const keys = items.map((r) => r.key);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET lock_timeout = \'5s\'');
    await client.query('SET statement_timeout = \'30s\'');

    for (const report of items) {
      // Sync report_catalog table
      await client.query(
        `
        INSERT INTO report_catalog (key, title, description, scope, group_key, order_index, is_active, sources, config)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (key) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          scope = EXCLUDED.scope,
          group_key = EXCLUDED.group_key,
          order_index = EXCLUDED.order_index,
          is_active = EXCLUDED.is_active,
          sources = EXCLUDED.sources,
          config = EXCLUDED.config,
          updated_at = NOW()
        `,
        [
          report.key,
          report.title,
          report.description,
          report.scope,
          report.group_key,
          report.order_index,
          report.is_active !== false,
          report.sources,
          report.config || {},
        ]
      );

      // Sync report_widget_catalog table
      await client.query('DELETE FROM report_widget_catalog WHERE report_key = $1', [report.key]);
      for (const widget of report.widgets) {
        await client.query(
          `
          INSERT INTO report_widget_catalog
            (report_key, widget_key, title, chart_type, unit, query_id, order_index, config)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            report.key,
            widget.widget_key,
            widget.title,
            widget.chart_type,
            widget.unit || null,
            widget.query_id || null,
            Number.isFinite(widget.order_index) ? widget.order_index : 0,
            widget.config || {},
          ]
        );
      }
    }

    // Soft-disable removed reports
    if (keys.length) {
      await client.query('UPDATE report_catalog SET is_active = FALSE WHERE key <> ALL($1)', [keys]);
    }

    await client.query('COMMIT');
    if (logger?.info) logger.info(`Reports sync finished: ${items.length} report(s) upserted`);
    return items; // Return synced reports for catalog sync
  } catch (err) {
    await client.query('ROLLBACK');
    if (logger?.warn) logger.warn('Reports sync failed:', err?.message || err);
    else console.warn('Reports sync failed:', err?.message || err);
    throw err;
  } finally {
    client.release();
  }
}

async function listActiveReports() {
  try {
    const q = await pool.query(
      `
      SELECT key, title, description, scope, group_key, order_index, sources, config
      FROM report_catalog
      WHERE is_active = TRUE
      ORDER BY group_key, order_index, key
      `
    );
    return q.rows || [];
  } catch (err) {
    return [];
  }
}

async function getReportWithWidgets(reportKey) {
  try {
    const repQ = await pool.query(
      `
      SELECT key, title, description, scope, group_key, order_index, sources, config, is_active
      FROM report_catalog
      WHERE key = $1
      LIMIT 1
      `,
      [reportKey]
    );
    if (!repQ.rows.length) return null;
    const report = repQ.rows[0];
    const widQ = await pool.query(
      `
      SELECT widget_key, title, chart_type, unit, query_id, order_index, config
      FROM report_widget_catalog
      WHERE report_key = $1
      ORDER BY order_index, id
      `,
      [reportKey]
    );
    report.widgets = widQ.rows || [];
    return report;
  } catch (err) {
    return null;
  }
}

module.exports = {
  listReportsFromCode,
  syncReportsToDatabase,
  listActiveReports,
  getReportWithWidgets,
};
