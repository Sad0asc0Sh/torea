'use strict';

const express = require('express');
const { requireLogin } = require('../../middlewares/auth');
const { listActiveReports, getReportWithWidgets } = require('../../services/reports.service');
const { resolveAndRun } = require('../../reports/queries');
const { getUserDescendants, getRivalUserIds } = require('../../services/reportScope.service');

const router = express.Router();

const RIVALS_FUN_MESSAGE = 'اگر روحیتون ضعیفه یا اعتمادبه نفس خوبی ندارید این صفحه برای شما طراحی نشده است.';

function isSystemAdmin(user) {
  return String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';
}

function normalizeDate(d) {
  if (!d) return null;
  const iso = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

router.use(requireLogin);
router.use((req, res, next) => {
  res.locals.basePath = req.baseUrl || '';
  next();
});

router.get('/reports', async (req, res) => {
  const user = req.session?.user || null;
  const sysAdmin = isSystemAdmin(user);
  const reports = await listActiveReports().catch(() => []);

  // catalogAccess middleware already handles access control
  // We just list all active reports here (filtering done by catalog)
  const byGroup = {
    MY: reports.filter((r) => r.scope === 'MY'),
    TEAM: reports.filter((r) => r.scope === 'TEAM'),
    RIVALS: reports.filter((r) => r.scope === 'RIVALS'),
  };

  return res.render('shared/reports/index', {
    user,
    reportsByGroup: byGroup,
    rivalsMessage: RIVALS_FUN_MESSAGE,
    emptyMessage: !sysAdmin && reports.length === 0 ? 'گزارشی برای شما فعال نشده است' : null,
  });
});

router.get('/reports/:reportKey', async (req, res) => {
  const user = req.session?.user || null;
  const { reportKey } = req.params;
  const report = await getReportWithWidgets(reportKey);
  
  // catalogAccess middleware already handles access control
  // Just validate report exists and is active
  if (!report || report.is_active === false) {
    return res.status(404).send('گزارش یافت نشد');
  }

  return res.render('shared/reports/show', {
    user,
    report,
    rivalsMessage: report.scope === 'RIVALS' ? RIVALS_FUN_MESSAGE : null,
    filters: {
      from: normalizeDate(req.query?.from) || '',
      to: normalizeDate(req.query?.to) || '',
    },
  });
});

router.get('/api/reports/:reportKey/data', async (req, res) => {
  const user = req.session?.user || null;
  const { reportKey } = req.params;
  const from = normalizeDate(req.query?.from);
  const to = normalizeDate(req.query?.to);

  const report = await getReportWithWidgets(reportKey);
  
  // catalogAccess middleware already handles access control
  // Just validate report exists and is active
  if (!report || report.is_active === false) {
    return res.status(404).json({ error: 'not_found' });
  }

  let teamUserIds = [];
  let rivalUserIds = [];

  if (report.scope === 'TEAM') {
    teamUserIds = await getUserDescendants(user?.id).catch(() => []);
  }
  if (report.scope === 'RIVALS') {
    rivalUserIds = await getRivalUserIds(user?.org_node_id || null, user?.id).catch(() => []);
  }

  const widgets = [];
  for (const widget of report.widgets || []) {
    const result = await resolveAndRun(widget.query_id, {
      from,
      to,
      viewerUser: user,
      scope: report.scope,
      teamUserIds,
      rivalUserIds,
    });
    widgets.push({
      widget_key: widget.widget_key,
      title: widget.title,
      chart_type: widget.chart_type,
      unit: widget.unit || null,
      series: result.series || [],
      meta: result.meta || {},
    });
  }

  return res.json({
    report: { key: report.key, title: report.title, scope: report.scope },
    filters: { from: from || null, to: to || null },
    widgets,
  });
});

module.exports = router;
