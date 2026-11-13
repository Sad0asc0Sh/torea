const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { test, mock } = require('node:test');
const { Pool } = require('pg');

test('automation routes allow authenticated system admin in test mode', async () => {
  // Set NODE_ENV=test to enable mock authenticated admin session
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  
  // Clear module cache to ensure middleware loads with test environment settings
  // This is necessary because the middleware behavior changes based on NODE_ENV
  delete require.cache[require.resolve('../src/middlewares/systemAdmin')];
  delete require.cache[require.resolve('../src/routes/admin/tools/automation.routes')];
  delete require.cache[require.resolve('../src/routes/admin')];
  
  const poolQueryStub = mock.method(Pool.prototype, 'query', async () => ({ rows: [] }));
  const dbPool = require('../src/config/db');
  const dbQueryStub = mock.method(dbPool, 'query', async () => ({ rows: [] }));

  // Setup app WITH authenticated system admin
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  
  // Mock session middleware with authenticated system admin
  app.use((req, res, next) => {
    req.session = { 
      system_admin_id: 1,
      user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' }
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

  const automationUrls = [
    '/admin/tools/office-automation',
    '/admin/tools/office-automation/request',
    '/admin/tools/office-automation/referral',
    '/admin/tools/office-automation/announcement',
  ];

  for (const url of automationUrls) {
    const res = await request(app).get(url);
    assert.strictEqual(
      res.statusCode,
      200,
      `expected 200 for ${url} when authenticated in test mode, got ${res.statusCode}`
    );
  }

  poolQueryStub.mock.restore();
  dbQueryStub.mock.restore();
  
  // Restore environment
  if (originalNodeEnv !== undefined) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
});

test('automation routes have requireSystemAdmin middleware applied', async () => {
  // This test verifies that the middleware is in the correct position in the router stack
  const { requireSystemAdmin } = require('../src/middlewares/systemAdmin');
  const automationRouter = require('../src/routes/admin/tools/automation.routes');
  
  // Check that the router has middleware layers
  const middlewareStack = automationRouter.stack || [];
  
  // Look for the requireSystemAdmin middleware in the stack
  const hasAuthMiddleware = middlewareStack.some(layer => {
    return layer.handle === requireSystemAdmin || 
           layer.handle.name === 'requireSystemAdmin';
  });
  
  assert.ok(
    hasAuthMiddleware,
    'requireSystemAdmin middleware should be applied to automation routes'
  );
});
