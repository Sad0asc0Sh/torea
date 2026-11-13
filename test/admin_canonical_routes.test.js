const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { test, mock } = require('node:test');
const { Pool } = require('pg');

test('all canonical admin routes respond with 200', async () => {
  // Set test environment to enable mock authenticated admin session
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  
  const poolQueryStub = mock.method(Pool.prototype, 'query', async () => ({ rows: [] }));
  const dbPool = require('../src/config/db');
  const dbQueryStub = mock.method(dbPool, 'query', async () => ({ rows: [] }));

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use((req, res, next) => {
    req.session = { 
      system_admin_id: 1,
      user: { id: 1, role: 'SYSTEM_ADMIN' }
    };
    req.systemAdmin = { id: 1, username: 'admin', is_active: true };
    res.locals.user = req.session.user;
    res.locals.systemAdmin = req.systemAdmin;
    res.locals.formatMoney = () => '';
    res.locals.formatMoneyEn = () => '';
    next();
  });

  const adminRouter = require('../src/routes/admin');
  app.use('/admin', adminRouter);

  const urls = [
    '/admin/tools',
    '/admin/tools/practice',
    '/admin/tools/negotiation-analysis',
    '/admin/tools/office-automation',
    '/admin/tools/office-automation/requests',
    '/admin/tools/office-automation/referrals',
    '/admin/tools/office-automation/announcements',
    '/admin/balance',
    '/admin/balance/stats',
    '/admin/balance/credit-sales/new',
    '/admin/balance/debts',
    '/admin/balance/settlement-requests',
    '/admin/inbox',
    '/admin/reports',
    '/admin/reports/personal',
    '/admin/reports/team',
    '/admin/reports/competitors',
    '/admin/reports/company',
    '/admin/definitions',
    '/admin/definitions/users',
    '/admin/definitions/hierarchy',
    '/admin/definitions/products',
    '/admin/definitions/teams',
    '/admin/definitions/customers',
    '/admin/definitions/base',
    '/admin/definitions/base/roles',
    '/admin/definitions/base/brands',
    '/admin/definitions/base/customer-industries',
    '/admin/definitions/base/automation-topics',
    '/admin/definitions/credit-policies',
    '/admin/settings',
    '/admin/settings/themes',
    '/admin/settings/catalog-access',
    '/admin/settings/company',
    '/admin/settings/company/general',
    '/admin/settings/company/telegram',
    '/admin/settings/company/admin-profile',
    '/admin/settings/company/automation-api',
    '/admin/settings/training',
    '/admin/settings/training/topics',
    '/admin/settings/training/thresholds',
    '/admin/settings/training/apis',
  ];

  for (const url of urls) {
    const res = await request(app).get(url);
    assert.strictEqual(res.statusCode, 200, `expected 200 for ${url}, got ${res.statusCode}`);
  }

  poolQueryStub.mock.restore();
  dbQueryStub.mock.restore();
  
  // Restore original NODE_ENV
  process.env.NODE_ENV = originalNodeEnv;
});

test('legacy approval placeholder routes redirect to inbox with 301', async () => {
  // Set test environment to enable mock authenticated admin session
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  
  const poolQueryStub = mock.method(Pool.prototype, 'query', async () => ({ rows: [] }));
  const dbPool = require('../src/config/db');
  const dbQueryStub = mock.method(dbPool, 'query', async () => ({ rows: [] }));

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use((req, res, next) => {
    req.session = { 
      system_admin_id: 1,
      user: { id: 1, role: 'SYSTEM_ADMIN' }
    };
    req.systemAdmin = { id: 1, username: 'admin', is_active: true };
    res.locals.user = req.session.user;
    res.locals.systemAdmin = req.systemAdmin;
    res.locals.formatMoney = () => '';
    res.locals.formatMoneyEn = () => '';
    next();
  });

  const adminRouter = require('../src/routes/admin');
  app.use('/admin', adminRouter);

  const redirectRoutes = [
    { url: '/admin/approvals', expectedLocation: '/admin/inbox' },
    { url: '/admin/approvals/credit-sales', expectedLocation: '/admin/inbox?category=credit' },
    { url: '/admin/approvals/settlements', expectedLocation: '/admin/inbox?category=credit' },
    { url: '/admin/approvals/automation', expectedLocation: '/admin/inbox?category=automation' },
    { url: '/admin/approvals/automation/requests', expectedLocation: '/admin/inbox?category=automation' },
    { url: '/admin/approvals/automation/referrals', expectedLocation: '/admin/inbox?category=automation' },
    { url: '/admin/approvals/automation/announcements', expectedLocation: '/admin/inbox?category=automation' },
    { url: '/admin/approvals/team-users-auth', expectedLocation: '/admin/inbox?category=users' },
  ];

  for (const { url, expectedLocation } of redirectRoutes) {
    const res = await request(app).get(url);
    assert.strictEqual(res.statusCode, 301, `expected 301 redirect for ${url}, got ${res.statusCode}`);
    assert.strictEqual(res.headers.location, expectedLocation, `expected redirect to ${expectedLocation} for ${url}, got ${res.headers.location}`);
  }

  poolQueryStub.mock.restore();
  dbQueryStub.mock.restore();
  
  // Restore original NODE_ENV
  process.env.NODE_ENV = originalNodeEnv;
});
