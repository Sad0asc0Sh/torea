const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

function buildApp({ nodes, users, policies = [] }) {
  const policyStore = new Map();
  policies.forEach((p) => policyStore.set(p.org_node_id, { ...p }));

  const query = mock.fn(async (sql, params = []) => {
    const trimmed = sql.trim();

    if (trimmed.includes('FROM org_nodes n') && trimmed.includes('org_credit_policy')) {
      const rows = nodes.map((n) => {
        const pol = policyStore.get(n.id) || null;
        const approver1 = pol ? nodes.find((x) => Number(x.id) === Number(pol.approver1_node_id)) : null;
        const approver2 = pol ? nodes.find((x) => Number(x.id) === Number(pol.approver2_node_id)) : null;
        const financeUser = pol ? users.find((u) => String(u.id) === String(pol.finance_user_id)) : null;
        return {
          org_node_id: n.id,
          org_node_title: n.title,
          approver1_node_id: pol ? pol.approver1_node_id : null,
          approver1_title: approver1 ? approver1.title : null,
          approver2_node_id: pol ? pol.approver2_node_id : null,
          approver2_title: approver2 ? approver2.title : null,
          finance_required: pol ? !!pol.finance_required : false,
          finance_user_id: pol ? pol.finance_user_id : null,
          finance_user_name: financeUser ? financeUser.display_name : null,
          finance_username: financeUser ? financeUser.username : null,
          max_open_invoices_per_user: pol ? pol.max_open_invoices_per_user : null,
          max_open_amount_per_user: pol ? pol.max_open_amount_per_user : null,
          max_open_invoices_per_customer: pol ? pol.max_open_invoices_per_customer : null,
          max_open_amount_per_customer: pol ? pol.max_open_amount_per_customer : null,
          max_invoice_amount: pol ? pol.max_invoice_amount : null,
        };
      });
      return { rows };
    }

    if (trimmed.startsWith('SELECT id, title FROM org_nodes ORDER BY id')) {
      return { rows: nodes };
    }

    if (trimmed.startsWith('SELECT id, title FROM org_nodes WHERE id = $1')) {
      const id = params[0];
      return { rows: nodes.filter((n) => Number(n.id) === Number(id)) };
    }

    if (trimmed.startsWith('SELECT * FROM org_credit_policy WHERE org_node_id=$1')) {
      const id = params[0];
      const p = policyStore.get(Number(id));
      return { rows: p ? [p] : [] };
    }

    if (trimmed.startsWith("SELECT id, CONCAT_WS(' ', first_name, last_name) AS display_name FROM users ORDER BY id")) {
      return { rows: users };
    }

    if (trimmed.startsWith('INSERT INTO org_credit_policy')) {
      const [
        orgNodeId,
        approver1,
        approver2,
        financeRequired,
        financeUserId,
        maxOpenInvoicesPerUser,
        maxOpenAmountPerUser,
        maxOpenInvoicesPerCustomer,
        maxOpenAmountPerCustomer,
        maxInvoiceAmount,
      ] = params;

      policyStore.set(orgNodeId, {
        org_node_id: orgNodeId,
        approver1_node_id: approver1,
        approver2_node_id: approver2,
        finance_required: financeRequired,
        finance_user_id: financeUserId,
        max_open_invoices_per_user: maxOpenInvoicesPerUser,
        max_open_amount_per_user: maxOpenAmountPerUser,
        max_open_invoices_per_customer: maxOpenInvoicesPerCustomer,
        max_open_amount_per_customer: maxOpenAmountPerCustomer,
        max_invoice_amount: maxInvoiceAmount,
      });
      return { rows: [] };
    }

    throw new Error('Unexpected SQL: ' + trimmed);
  });

  const dbPath = require.resolve('../../../../../src/config/db');
  require.cache[dbPath] = { exports: { query } };
  delete require.cache[require.resolve('./creditPolicy.routes')];
  const router = require('./creditPolicy.routes');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: 'auto' },
  }));
  app.use((req, res, next) => {
    req.session.user = { id: 9, username: 'sys', role: 'SYSTEM_ADMIN' };
    next();
  });
  app.use('/admin', router);

  return { app, policyStore, query };
}

test('POST upserts credit policy and list shows finance user', async () => {
  const { app, policyStore } = buildApp({
    nodes: [
      { id: 1, title: 'CEO' },
      { id: 2, title: 'Finance' },
    ],
    users: [
      { id: 7, display_name: 'Fin User', username: 'fin' },
    ],
  });

  const resPost = await request(app)
    .post('/admin/definitions/credit-policy/1')
    .type('form')
    .send({
      approver1_node_id: '1',
      approver2_node_id: '2',
      finance_required: 'on',
      finance_user_id: '7',
      max_invoice_amount: '5000',
    });

  assert.equal(resPost.status, 302);
  assert.ok(resPost.headers.location.startsWith('/admin/definitions/credit-policy'));

  const saved = policyStore.get(1);
  assert.equal(saved.approver1_node_id, 1);
  assert.equal(saved.approver2_node_id, 2);
  assert.equal(saved.finance_required, true);
  assert.equal(String(saved.finance_user_id), '7');
  assert.equal(saved.max_invoice_amount, 5000);

  const res = await request(app).get('/admin/definitions/credit-policy');
  assert.equal(res.status, 200);
  assert.match(res.text, /Fin User/);
  assert.match(res.text, /CEO/);
});

test('GET edit form renders without finance users', async () => {
  const { app } = buildApp({
    nodes: [{ id: 4, title: 'Branch' }],
    users: [],
  });

  const res = await request(app).get('/admin/definitions/credit-policy/4');
  assert.equal(res.status, 200);
  assert.match(res.text, /finance_user_id/);
});

test('requires finance user when finance approval is checked', async () => {
  const { app, policyStore, query } = buildApp({
    nodes: [{ id: 5, title: 'Ops' }],
    users: [],
  });

  const res = await request(app)
    .post('/admin/definitions/credit-policy/5')
    .type('form')
    .send({
      approver1_node_id: '5',
      finance_required: 'on',
    });

  assert.equal(res.status, 200);
  assert.match(res.text, /انتخاب کاربر مالی الزامی است/);
  assert.equal(policyStore.size, 0);
  const insertCalls = query.mock.calls.filter((c) => String(c.arguments[0]).includes('INSERT INTO org_credit_policy'));
  assert.equal(insertCalls.length, 0);
});
