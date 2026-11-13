const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

test('finance approval settles request and hides it from open seller list', async () => {
  const creditSale = {
    id: 5,
    customer_code: 'C-5',
    customer_name: 'Cust Five',
    invoice_amount: 7500,
    due_date: '2024-01-10',
    final_status: 'approved',
    finance_user_id: 11,
    seller_user_id: 7,
    requester_user_id: 7,
  };
  let settlement = null;

  const query = mock.fn(async (sql, params = []) => {
    const t = sql.trim();

    if (t.startsWith('SELECT id, customer_code, customer_name, invoice_amount, due_date')) {
      // loadSale and my-open list
      if (t.includes('WHERE id=$1')) {
        return { rows: [creditSale] };
      }
      const statuses = params[1] || [];
      const rows = statuses.includes(creditSale.final_status)
        ? [{
            id: creditSale.id,
            customer_code: creditSale.customer_code,
            customer_name: creditSale.customer_name,
            invoice_amount: creditSale.invoice_amount,
            due_date: creditSale.due_date,
            final_status: creditSale.final_status,
            approver1_status: 'approved',
            approver2_status: 'approved',
            finance_status: 'approved',
          }]
        : [];
      return { rows };
    }

    if (t.startsWith('SELECT id FROM credit_settlement_requests WHERE credit_request_id=$1')) {
      return {
        rows: settlement && settlement.credit_request_id === params[0] && settlement.status === 'pending' ? [{ id: settlement.id }] : [],
      };
    }

    if (t.startsWith('INSERT INTO credit_settlement_requests')) {
      settlement = {
        id: 22,
        credit_request_id: params[0],
        settlement_type: params[1],
        settlement_ref_no: params[2],
        notes: params[3],
        status: 'pending',
      };
      return { rows: [{ id: settlement.id }] };
    }

    if (t.startsWith('SELECT csr.id AS settlement_id')) {
      if (settlement && settlement.status === 'pending' && Number(params[0]) === Number(creditSale.finance_user_id)) {
        return {
          rows: [{
            settlement_id: settlement.id,
            credit_request_id: settlement.credit_request_id,
            settlement_type: settlement.settlement_type,
            settlement_ref_no: settlement.settlement_ref_no,
            notes: settlement.notes,
            status: settlement.status,
            customer_code: creditSale.customer_code,
            customer_name: creditSale.customer_name,
            invoice_amount: creditSale.invoice_amount,
          }],
        };
      }
      return { rows: [] };
    }

    if (t.startsWith('SELECT csr.*, cr.finance_user_id, cr.final_status')) {
      if (!settlement) return { rows: [] };
      return {
        rows: [{
          ...settlement,
          finance_user_id: creditSale.finance_user_id,
          credit_request_id: settlement.credit_request_id,
          final_status: creditSale.final_status,
        }],
      };
    }

    if (t.startsWith('UPDATE credit_settlement_requests SET status=$2')) {
      if (!settlement || settlement.status !== 'pending') return { rowCount: 0, rows: [] };
      settlement.status = params[1];
      return { rowCount: 1, rows: [settlement] };
    }

    if (t.startsWith('UPDATE credit_sale_requests')) {
      creditSale.final_status = 'settled';
      creditSale.settled_at = new Date();
      return { rowCount: 1, rows: [] };
    }

    return { rows: [] };
  });

  const dbPath = require.resolve('../../../src/config/db');
  require.cache[dbPath] = { exports: { query } };
  delete require.cache[require.resolve('./creditSettlement.routes')];
  delete require.cache[require.resolve('./creditSale.routes')];
  const settlementRouter = require('./creditSettlement.routes');
  const saleRouter = require('./creditSale.routes');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 't', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    const override = req.headers['x-test-user'];
    if (override === 'finance') {
      req.session.user = { id: creditSale.finance_user_id, role: 'USER' };
    } else {
      req.session.user = { id: creditSale.seller_user_id, role: 'USER' };
    }
    next();
  });
  app.use(saleRouter);
  app.use(settlementRouter);

  const agent = request.agent(app);

  await agent
    .post('/tools/credit-settlement')
    .type('form')
    .send({ credit_request_id: creditSale.id, settlement_type: 'cash', settlement_ref_no: 'R-1', notes: 'n' })
    .expect(302);
  assert.equal(settlement.status, 'pending');

  await agent
    .post(`/tools/credit-settlement/${settlement.id}/decide`)
    .set('x-test-user', 'finance')
    .type('form')
    .send({ decision: 'approve' })
    .expect(302);

  assert.equal(settlement.status, 'approved');
  assert.equal(creditSale.final_status, 'settled');

  const listRes = await agent
    .get('/tools/credit-sale/my-open')
    .set('x-test-user', 'seller');

  assert.equal(listRes.status, 200);
  assert.ok(!String(listRes.text).includes(creditSale.customer_code), 'settled request should not appear in open list');
});
