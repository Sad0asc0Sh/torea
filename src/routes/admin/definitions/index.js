'use strict';

const express = require('express');
const router = express.Router();
const MAX_MSG_LENGTH = 2000;

function safeMsg(v) {
  if (!v) return null;
  const s = String(v);
  return s.length > MAX_MSG_LENGTH ? s.slice(0, MAX_MSG_LENGTH) : s;
}

function baseLocals(req, extra = {}) {
  return {
    user: req.session?.user || null,
    error: null,
    warn: null,
    info: null,
    ...extra,
  };
}

function renderDefinitionsHome(req, res) {
  return res.render(
    'admin/definitions/index',
    baseLocals(req, {
      error: safeMsg(req.query?.err),
      warn: safeMsg(req.query?.warn),
      info: safeMsg(req.query?.ok || req.query?.info),
    })
  );
}

router.get('/definitions', renderDefinitionsHome);
router.get('/definitions/', renderDefinitionsHome);

router.get('/definitions/base', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'definitions_base',
    title: 'تعاریف پایه',
    backHref: '/admin/definitions',
  })
);

router.get('/definitions/base/roles', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'definitions_roles',
    title: 'نقش‌ها',
    backHref: '/admin/definitions/base',
  })
);

router.get('/definitions/customers', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'def_customers',
    title: 'مشتریان',
    backHref: '/admin/definitions',
    message: null,
  })
);

router.get('/definitions/base/brands', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'definitions_brands',
    title: 'برندها',
    backHref: '/admin/definitions/base',
    message: null,
  })
);

router.get('/definitions/base/customer-industries', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'customer_industries',
    title: 'صنایع مشتریان',
    backHref: '/admin/definitions/base',
    message: null,
  })
);

router.get('/definitions/base/automation-topics', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'automation_topics',
    title: 'موضوعات اتوماسیون',
    backHref: '/admin/definitions/base',
    message: null,
  })
);

router.get('/definitions/credit-policies', (req, res) =>
  res.render('admin/definitions/placeholder', {
    user: req.session?.user || null,
    activeKey: 'credit_policy',
    title: 'سیاست‌های اعتباری',
    backHref: '/admin/definitions',
    message: null,
  })
);

// Mount all definition routes under /definitions
const brandsRoutes = require('./brands.routes');
const productsRoutes = require('./products.routes');
const teamsRoutes = require('./teams.routes');
const creditPolicyRoutes = require('./creditPolicy.routes');
const usersRoutes = require('./users.routes');
const trainingSettingsRoutes = require('./trainingSettings.routes');
const automationTopicsRoutes = require('./automationTopics.routes');
const customerIndustriesRoutes = require('./customerIndustries.routes');

router.use(brandsRoutes);
router.use(productsRoutes);
router.use(teamsRoutes);
router.use(creditPolicyRoutes);
router.use(usersRoutes);
router.use(trainingSettingsRoutes);
router.use(automationTopicsRoutes);
router.use(customerIndustriesRoutes);

module.exports = router;
