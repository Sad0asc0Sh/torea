const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_STORE = 'memory';
process.env.BYPASS_AUTH_FOR_TESTS = 'true';
process.env.BYPASS_SYSTEM_ADMIN = 'true';

const app = require('../src/app');

test('key pages respond with 200', async () => {
  const adminDashboard = await request(app).get('/admin/dashboard');
  assert.equal(adminDashboard.status, 200);

  const adminReports = await request(app).get('/admin/reports');
  assert.equal(adminReports.status, 200);

  const userDashboard = await request(app).get('/user/dashboard');
  assert.equal(userDashboard.status, 200);
});

test('legacy user paths redirect to /user equivalents', async () => {
  const customers = await request(app).get('/customers');
  assert.equal(customers.status, 301);
  assert.equal(customers.headers.location, '/user/customers');

  const creditSale = await request(app).post('/tools/credit-sale').send({ a: 1 });
  assert.equal(creditSale.status, 307);
  assert.equal(creditSale.headers.location, '/user/tools/credit-sale');

  const reports = await request(app).get('/reports/demo');
  assert.equal(reports.status, 301);
  assert.equal(reports.headers.location, '/user/reports/demo');
});
