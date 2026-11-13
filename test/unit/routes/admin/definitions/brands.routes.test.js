const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

function buildApp(overrides) {
  const brandsService = require('../../../services/brands.service');
  const defaults = {
    listBrandsWithCounts: async () => [],
    getBrandById: async () => null,
    isNameTaken: async () => false,
    isCodeTaken: async () => false,
    createBrand: async () => ({}),
    updateBrand: async () => ({}),
    toggleBrandActive: async () => ({}),
    countProducts: async () => 0,
    listActiveUsersForManagerSelect: async () => [],
  };
  Object.assign(brandsService, defaults, overrides);

  delete require.cache[require.resolve('./brands.routes')];
  const router = require('./brands.routes');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: true },
    })
  );
  app.use((req, res, next) => {
    req.session.user = { id: 1, username: 'sys', role: 'SYSTEM_ADMIN' };
    next();
  });
  app.use('/admin', router);

  return { app };
}

test('renders brands list without DB errors', async () => {
  const listBrandsWithCounts = mock.fn(async () => [{ id: 1, name: 'Brand', code: null, is_active: true }]);
  const { app } = buildApp({ listBrandsWithCounts });

  const res = await request(app).get('/admin/definitions/brands');

  assert.equal(res.status, 200);
  assert.equal(listBrandsWithCounts.mock.calls.length, 1);
});

test('rejects brand creation when name is missing', async () => {
  const createBrand = mock.fn(async () => ({}));
  const isNameTaken = mock.fn(async () => false);
  const isCodeTaken = mock.fn(async () => false);

  const { app } = buildApp({ createBrand, isNameTaken, isCodeTaken });

  const res = await request(app)
    .post('/admin/definitions/brands')
    .type('form')
    .send({ name: '' });

  assert.equal(res.status, 200);
  assert.match(res.text, /نام برند الزامی/);
  assert.equal(createBrand.mock.calls.length, 0);
});

test('blocks duplicate brand code on create', async () => {
  const createBrand = mock.fn(async () => ({}));
  const isNameTaken = mock.fn(async () => false);
  const isCodeTaken = mock.fn(async () => true);

  const { app } = buildApp({ createBrand, isNameTaken, isCodeTaken });

  const res = await request(app)
    .post('/admin/definitions/brands')
    .type('form')
    .send({ name: 'ACME', code: 'B-1' });

  assert.equal(res.status, 200);
  assert.match(res.text, /کد برند تکراری است/);
  assert.equal(createBrand.mock.calls.length, 0);
});

test('sets blank code to null on create', async () => {
  const createBrand = mock.fn(async () => ({ id: 7 }));
  const isNameTaken = mock.fn(async () => false);
  const isCodeTaken = mock.fn(async () => false);
  const listActiveUsersForManagerSelect = mock.fn(async () => []);

  const { app } = buildApp({ createBrand, isNameTaken, isCodeTaken, listActiveUsersForManagerSelect });

  await request(app)
    .post('/admin/definitions/brands')
    .type('form')
    .send({ name: 'Brand Without Code', code: '   ' })
    .expect(302)
    .expect('Location', /ok=/);

  assert.equal(createBrand.mock.calls.length, 1);
  assert.equal(createBrand.mock.calls[0].arguments[0].code, null);
  assert.equal(createBrand.mock.calls[0].arguments[0].managerUserId, null);
  assert.equal(listActiveUsersForManagerSelect.mock.calls.length > 0, true);
});

test('sets blank code to null on update', async () => {
  const getBrandById = mock.fn(async () => ({ id: 2, name: 'Old', code: 'X', is_active: true }));
  const isNameTaken = mock.fn(async () => false);
  const isCodeTaken = mock.fn(async () => false);
  const updateBrand = mock.fn(async () => ({}));
  const listActiveUsersForManagerSelect = mock.fn(async () => []);

  const { app } = buildApp({ getBrandById, isNameTaken, isCodeTaken, updateBrand, listActiveUsersForManagerSelect });

  await request(app)
    .post('/admin/definitions/brands/2')
    .type('form')
    .send({ name: 'New Name', code: '   ', is_active: 'on' })
    .expect(302)
    .expect('Location', /ok=/);

  assert.equal(updateBrand.mock.calls.length, 1);
  assert.equal(updateBrand.mock.calls[0].arguments[0].code, null);
  assert.equal(updateBrand.mock.calls[0].arguments[0].managerUserId, null);
});

test('toggle shows warning when brand has products', async () => {
  const getBrandById = mock.fn(async () => ({ id: 5, name: 'WithItems', is_active: true }));
  const countProducts = mock.fn(async () => 3);
  const toggleBrandActive = mock.fn(async () => ({}));

  const { app } = buildApp({ getBrandById, countProducts, toggleBrandActive });

  await request(app)
    .post('/admin/definitions/brands/5/toggle')
    .expect(302)
    .expect('Location', /warn=/);

  assert.equal(toggleBrandActive.mock.calls.length, 1);
});

test('creates brand successfully with optional code', async () => {
  const createBrand = mock.fn(async () => ({ id: 3 }));
  const isNameTaken = mock.fn(async () => false);
  const isCodeTaken = mock.fn(async () => false);
  const listActiveUsersForManagerSelect = mock.fn(async () => []);

  const { app } = buildApp({ createBrand, isNameTaken, isCodeTaken, listActiveUsersForManagerSelect });

  const res = await request(app)
    .post('/admin/definitions/brands')
    .type('form')
    .send({ name: 'New Brand', code: ' BR-01 ' });

  assert.equal(res.status, 302);
  assert.match(res.headers.location, /ok=/);
  assert.equal(createBrand.mock.calls.length, 1);
  assert.equal(createBrand.mock.calls[0].arguments[0].code, 'BR-01');
});

test('forwards manager_user_id when provided on create', async () => {
  const createBrand = mock.fn(async () => ({ id: 4 }));
  const isNameTaken = mock.fn(async () => false);
  const isCodeTaken = mock.fn(async () => false);
  const listActiveUsersForManagerSelect = mock.fn(async () => []);

  const { app } = buildApp({ createBrand, isNameTaken, isCodeTaken, listActiveUsersForManagerSelect });

  await request(app)
    .post('/admin/definitions/brands')
    .type('form')
    .send({ name: 'Managed Brand', manager_user_id: '11111111-1111-1111-1111-111111111111' })
    .expect(302)
    .expect('Location', /ok=/);

  assert.equal(createBrand.mock.calls.length, 1);
  assert.equal(createBrand.mock.calls[0].arguments[0].managerUserId, '11111111-1111-1111-1111-111111111111');
});
