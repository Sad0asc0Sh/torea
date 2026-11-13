const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const ExcelJS = require('exceljs');
const pool = require('../../../../../src/config/db');

const poolQueryMock = mock.method(pool, 'query', async () => ({ rows: [] }));

async function buildXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('debts');
  ws.addRows(rows);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildApp(overrides = {}) {
  if (pool.query && pool.query.mock) {
    pool.query.mock.mockImplementation(overrides.poolQuery || (async () => ({ rows: [] })));
  }
  const auth = require('../../../middlewares/auth');
  const guards = require('../../../middlewares/guards');
  const originalRequireLogin = auth.requireLogin;
  const originalEnforceRole = guards.enforceRole;
  const originalEnforceStatus = guards.enforceStatus;
  auth.requireLogin = (req, res, next) => {
    req.session.user = req.session.user || { id: 1, role: 'SYSTEM_ADMIN' };
    return next();
  };
  guards.enforceRole = () => (req, res, next) => next();
  guards.enforceStatus = (req, res, next) => next();

  delete require.cache[require.resolve('./index')];
  const router = require('./index');
  auth.requireLogin = originalRequireLogin;
  guards.enforceRole = originalEnforceRole;
  guards.enforceStatus = originalEnforceStatus;

  const debtsImportService = require('../../../services/debtsImport.service');
  if (overrides.debtsImport) {
    Object.assign(debtsImportService, overrides.debtsImport);
  }

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    })
  );
  app.use((req, res, next) => {
    req.session.user = req.session.user || { id: 1, role: 'SYSTEM_ADMIN' };
    next();
  });
  app.use('/admin', router);
  return { app, debtsImportService };
}

test('GET import page returns 200', async () => {
  const { app } = buildApp();
  await request(app).get('/admin/balance/debts/import').expect(200);
});

test('template.xlsx returns expected headers', async () => {
  const { app } = buildApp();
  const res = await request(app)
    .get('/admin/balance/debts/template.xlsx')
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200)
    .expect('Content-Type', /spreadsheetml\.sheet/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  const sheet = wb.getWorksheet('debts');
  const headerRow = sheet ? sheet.getRow(1).values.slice(1) : [];
  assert.deepEqual(headerRow, ['کد مشتری', 'مبلغ بدهی', 'تاریخ سررسید', 'شماره فاکتور', 'نام مشتری', 'کد مالی فروشنده']);
  const row2 = sheet ? sheet.getRow(2).values.slice(1) : [];
  const row3 = sheet ? sheet.getRow(3).values.slice(1) : [];
  assert.ok(row2.length && row3.length);
  assert.ok(row2.includes('AC-501'));
  assert.ok(row3.includes('AC-502'));
});

test('preview route rejects missing file', async () => {
  const { app } = buildApp();
  const res = await request(app).post('/admin/balance/debts/import/preview').expect(302);
  assert.match(res.headers.location, /err=/);
});

test('confirm route rejects when required mapping missing', async () => {
  const { app } = buildApp();
  const agent = request.agent(app);
  const buf = await buildXlsx([
    ['customer_code', 'amount', 'due_date'],
    ['C1', 1000, '2025-01-01'],
  ]);
  await agent.post('/admin/balance/debts/import/preview').attach('file', buf, 'debts.xlsx').expect(200);
  const res = await agent
    .post('/admin/balance/debts/import/confirm')
    .type('form')
    .send({ map_customer_code: '', map_amount: '1' })
    .expect(200);
  assert.match(res.text, /الزامی/);
});

test('confirm route imports valid Persian file and calls service', async () => {
  const importRows = mock.fn(async () => ({ inserted: 1, updated: 0 }));
  const { app, debtsImportService } = buildApp({
    debtsImport: { importRows },
    poolQuery: async (sql, params) => {
      if (String(sql).includes('accounting_code')) {
        return { rows: [{ id: 55, accounting_code: params[0] }] };
      }
      return { rows: [] };
    },
  });
  const agent = request.agent(app);
  const buf = await buildXlsx([
    ['کد مشتری', 'مبلغ بدهی', 'تاریخ سررسید', 'شماره فاکتور', 'کد مالی فروشنده'],
    ['۵۰۱', '۱۰۰,۰۰۰', '2025-01-01', 'فاکتور-۱', 'AC-900'],
  ]);
  await agent.post('/admin/balance/debts/import/preview').attach('file', buf, 'good.xlsx').expect(200);
  const res = await agent
    .post('/admin/balance/debts/import/confirm')
    .type('form')
    .send({
      map_customer_code: '0',
      map_amount: '1',
      map_due_date: '2',
      map_invoice_number: '3',
      map_seller_accounting_code: '4',
    })
    .expect(302);

  assert.match(res.headers.location, /ok=/);
  assert.equal(importRows.mock.calls.length, 1);
  const rows = importRows.mock.calls[0].arguments[0];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customer_code, '۵۰۱');
  assert.equal(rows[0].invoice_amount, 100000);
  assert.equal(rows[0].invoice_number, 'فاکتور-۱');
  assert.equal(rows[0].seller_user_id, 55);
});

test('prefers seller_accounting_code when present', async () => {
  const importRows = mock.fn(async () => ({ inserted: 1, updated: 0 }));
  const { app } = buildApp({
    debtsImport: { importRows },
    poolQuery: async (sql, params) => {
      if (String(sql).includes('accounting_code')) {
        return { rows: [{ id: 77, accounting_code: params[0], username: 'seller-acc' }] };
      }
      return { rows: [] };
    },
  });
  const agent = request.agent(app);
  const buf = await buildXlsx([
    ['customer_code', 'amount', 'due_date', 'invoice_number', 'customer_name', 'seller_accounting_code'],
    ['C3', '10000', '2025-01-01', 'INV-3', 'Cust', 'AC-200'],
  ]);
  await agent.post('/admin/balance/debts/import/preview').attach('file', buf, 'acc.xlsx').expect(200);
  const res = await agent
    .post('/admin/balance/debts/import/confirm')
    .type('form')
    .send({
      map_customer_code: '0',
      map_amount: '1',
      map_due_date: '2',
      map_invoice_number: '3',
      map_customer_name: '4',
      map_seller_accounting_code: '5',
    })
    .expect(302);

  assert.match(res.headers.location, /ok=/);
  const rows = importRows.mock.calls[0].arguments[0];
  assert.equal(rows[0].seller_user_id, 77);
});

test('falls back to seller_username when accounting_code missing', async () => {
  const importRows = mock.fn(async () => ({ inserted: 1, updated: 0 }));
  const { app } = buildApp({
    debtsImport: { importRows },
    poolQuery: async (sql, params) => {
      if (String(sql).includes('username')) {
        return { rows: [{ id: 88, username: params[0] }] };
      }
      return { rows: [] };
    },
  });
  const agent = request.agent(app);
  const buf = await buildXlsx([
    ['customer_code', 'amount', 'due_date', 'invoice_number', 'seller_username'],
    ['C4', '5000', '2025-02-01', 'INV-4', 'legacyuser'],
  ]);
  await agent.post('/admin/balance/debts/import/preview').attach('file', buf, 'user.xlsx').expect(200);
  const res = await agent
    .post('/admin/balance/debts/import/confirm')
    .type('form')
    .send({
      map_customer_code: '0',
      map_amount: '1',
      map_due_date: '2',
      map_invoice_number: '3',
      map_seller_username: '4',
    })
    .expect(302);
  assert.match(res.headers.location, /ok=/);
  const rows = importRows.mock.calls[0].arguments[0];
  assert.equal(rows[0].seller_user_id, 88);
});

test('rejects rows without seller identifiers', async () => {
  const importRows = mock.fn(async () => ({ inserted: 0, updated: 0 }));
  const { app } = buildApp({
    debtsImport: { importRows },
    poolQuery: async () => ({ rows: [] }),
  });
  const agent = request.agent(app);
  const buf = await buildXlsx([
    ['customer_code', 'amount', 'due_date'],
    ['C5', '12000', '2025-03-01'],
  ]);
  await agent.post('/admin/balance/debts/import/preview').attach('file', buf, 'missing.xlsx').expect(200);
  const res = await agent
    .post('/admin/balance/debts/import/confirm')
    .type('form')
    .send({
      map_customer_code: '0',
      map_amount: '1',
      map_due_date: '2',
    })
    .expect(302);
  assert.match(res.headers.location, /err=/);
  const page = await agent.get('/admin/balance/debts/import').expect(200);
  assert.match(page.text, /کد مالی فروشنده/);
});

test('reports invalid amount with clear error', async () => {
  const { app } = buildApp({
    poolQuery: async (sql, params) => {
      if (String(sql).includes('accounting_code')) {
        return { rows: [{ id: 10, accounting_code: params[0] }] };
      }
      return { rows: [] };
    },
  });
  const agent = request.agent(app);
  const buf = await buildXlsx([
    ['کد مشتری', 'مبلغ بدهی', 'کد مالی فروشنده'],
    ['ABC', 'مبلغ نامعتبر', 'AC-10'],
  ]);
  await agent.post('/admin/balance/debts/import/preview').attach('file', buf, 'invalid.xlsx').expect(200);
  const res = await agent
    .post('/admin/balance/debts/import/confirm')
    .type('form')
    .send({
      map_customer_code: '0',
      map_amount: '1',
      map_seller_accounting_code: '2',
    })
    .expect(302);
  assert.match(res.headers.location, /err=/);
  const page = await agent.get('/admin/balance/debts/import').expect(200);
  assert.match(page.text, /مبلغ نامعتبر/);
});
