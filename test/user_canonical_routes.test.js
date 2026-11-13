const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { test, mock } = require('node:test');
const { Pool } = require('pg');

test('canonical user routes respond with 200', async () => {
  const poolQueryStub = mock.method(Pool.prototype, 'query', async () => ({ rows: [] }));
  const dbPool = require('../src/config/db');
  const dbQueryStub = mock.method(dbPool, 'query', async () => ({ rows: [] }));

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'src', 'views'));
  app.use((req, res, next) => {
    req.session = { user: { id: 1, role: 'SYSTEM_ADMIN', org_node_id: 1 } };
    res.locals.user = req.session.user;
    res.locals.formatMoney = () => '';
    res.locals.formatMoneyEn = () => '';
    next();
  });

  const userRouter = require('../src/routes/user');
  app.use('/user', userRouter);

  const urls = [
    '/user/dashboard',
    '/user/customers',
    '/user/tools/credit-sale/new',
    '/user/tools/credit-sale/my-open',
    '/user/tools/credit-settlement/inbox',
    '/user/reports',
  ];

  for (const url of urls) {
    const res = await request(app).get(url);
    assert.strictEqual(res.statusCode, 200, `expected 200 for ${url}, got ${res.statusCode}`);
  }

  poolQueryStub.mock.restore();
  dbQueryStub.mock.restore();
});
