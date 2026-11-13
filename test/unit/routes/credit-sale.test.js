const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

function buildApp({ policyOverrides = {}, statsOverrides = {}, duplicate = false } = {}) {
  const seller = { id: 7, org_node_id: 3, first_name: 'Ali', last_name: 'Seller', username: 'ali' };
  const basePolicy = {
    approver1_node_id: 10,
    approver2_node_id: null,
    finance_required: false,
    finance_user_id: null,
    max_open_invoices_per_user: 1,
    max_open_amount_per_user: null,
    max_open_invoices_per_customer: null,
    max_open_amount_per_customer: null,
    max_invoice_amount: null,
  };
  const stats = {
    open_count_all: 1,
    open_amount_all: 0,
    open_count_customer: 0,
    open_amount_customer: 0,
    overdue_days_sum: 0,
    ...statsOverrides,
  };

  let lastInsertParams = null;

  const query = mock.fn(async (sql, params = []) => {
    const t = sql.trim();

    if (t.startsWith('SELECT id, org_node_id, first_name, last_name, username FROM users WHERE id=$1')) {
      return { rows: [seller] };
    }

    if (t.startsWith('SELECT id FROM credit_sale_requests')) {
      return { rows: duplicate ? [{ id: 99 }] : [] };
    }

    if (t.startsWith('SELECT * FROM org_credit_policy')) {
      return { rows: [{ ...basePolicy, ...policyOverrides }] };
    }

    if (t.startsWith('SELECT id FROM users WHERE org_node_id=$1 AND active = TRUE')) {
      return { rows: [{ id: 500 }] };
    }

    if (t.includes('open_count_all') && t.includes('FROM credit_sale_requests')) {
      return { rows: [stats] };
    }

    if (t.startsWith('INSERT INTO credit_sale_requests')) {
      lastInsertParams = params;
      return { rows: [{ id: 123 }] };
    }

    throw new Error('Unexpected SQL: ' + t);
  });

  const dbPath = require.resolve('../../../src/config/db');
  require.cache[dbPath] = { exports: { query } };
  delete require.cache[require.resolve('./creditSale.routes')];
  const router = require('./creditSale.routes');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 't', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = { id: seller.id, role: 'USER', username: seller.username };
    next();
  });
  app.use(router);

  return { app, query, getInsert: () => lastInsertParams };
}

test('controls failure stores rejected request with error message', async () => {
  const { app, getInsert, query } = buildApp();

  const res = await request(app)
    .post('/tools/credit-sale')
    .type('form')
    .send({
      customer_code: 'CUST1',
      customer_name: 'Customer One',
      invoice_amount: '5000',
      due_days: '5',
    });

  assert.equal(res.status, 302);
  const params = getInsert();
  assert.ok(params, 'insert should be called');
  assert.equal(params[7], 'rejected');
  assert.equal(params[8], false);
  assert.ok(params[9], 'controls_error should be filled');
  assert.equal(params[10], null); // approver1_node_id should be null when controls fail
  assert.equal(params[14], 'skipped');
  assert.equal(params[15], 'skipped');
  assert.equal(params[16], 'skipped');

  const insertCalls = query.mock.calls.filter((c) => String(c.arguments[0]).includes('INSERT INTO credit_sale_requests'));
  assert.equal(insertCalls.length, 1);
});

test('auto-approves when approvers are skipped', async () => {
  const { app, getInsert } = buildApp({
    policyOverrides: { approver1_node_id: null, finance_required: false },
    statsOverrides: { open_count_all: 0 },
  });

  const res = await request(app)
    .post('/tools/credit-sale')
    .type('form')
    .send({
      customer_code: 'CUST2',
      customer_name: 'Customer Two',
      invoice_amount: '5000',
      due_days: '5',
    });

  assert.equal(res.status, 302);
  const params = getInsert();
  assert.equal(params[7], 'approved');
  assert.equal(params[14], 'skipped');
  assert.equal(params[15], 'skipped');
  assert.equal(params[16], 'skipped');
});

test('approver1 approval sets final_status approved when all satisfied', async () => {
  const requestRow = {
    id: 9,
    customer_code: 'C2',
    customer_name: 'Cust',
    invoice_amount: 1000,
    due_days: 10,
    due_date: '2024-01-01',
    seller_user_id: 7,
    requester_user_id: 7,
    final_status: 'pending_approvals',
    approver1_node_id: 3,
    approver2_node_id: null,
    finance_required: false,
    finance_user_id: null,
    approver1_status: 'pending',
    approver2_status: 'pending',
    finance_status: 'approved',
  };

  let statusUpdated = false;
  let finalApproved = false;

  const query = mock.fn(async (sql, params = []) => {
    const t = sql.trim();
    if (t.startsWith('SELECT * FROM credit_sale_requests WHERE id=$1')) {
      return { rows: [requestRow] };
    }
    if (t.startsWith('SELECT id, org_node_id, first_name, last_name, username FROM users WHERE id=$1')) {
      return { rows: [{ id: 8, org_node_id: 3, first_name: 'A', last_name: 'App', username: 'approver' }] };
    }
    if (t.startsWith('UPDATE credit_sale_requests') && t.includes('SET final_status = \'approved\'')) {
      finalApproved = true;
      return { rowCount: 1, rows: [] };
    }
    if (t.startsWith('UPDATE credit_sale_requests') && t.includes('approver1_status')) {
      statusUpdated = true;
      return { rowCount: 1, rows: [] };
    }
    if (t.includes('open_count_all') && t.includes('FROM credit_sale_requests')) {
      return { rows: [{ open_count_all: 0, open_amount_all: 0, open_count_customer: 0, open_amount_customer: 0, overdue_days_sum: 0 }] };
    }
    if (t.startsWith('SELECT r.*,') || t.startsWith('SELECT id FROM credit_sale_requests') || t.startsWith('SELECT * FROM org_credit_policy')) {
      return { rows: [] };
    }
    throw new Error('Unexpected SQL: ' + t);
  });

  const dbPath = require.resolve('../../../src/config/db');
  require.cache[dbPath] = { exports: { query } };
  delete require.cache[require.resolve('./creditSale.routes')];
  const router = require('./creditSale.routes');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 't', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.user = { id: 8, role: 'USER', username: 'approver' };
    next();
  });
  app.use(router);

  const res = await request(app)
    .post('/tools/credit-sale/9/approve')
    .type('form')
    .send({ decision: 'approve' });

  assert.equal(res.status, 302);
  assert.ok(statusUpdated);
  assert.ok(finalApproved);
});
