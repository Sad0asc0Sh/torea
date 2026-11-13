const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const ExcelJS = require('exceljs');

const TEMPLATE_HEADERS_FA = ['کد برند', 'نام برند', 'نام کالا', 'کد کالا', 'نام‌های مستعار/برچسب‌ها', 'کالای کلیدی؟', 'فعال؟'];
const TEMPLATE_HEADERS_EN = ['brand_code', 'brand_name', 'product_name', 'sku_code', 'aliases', 'is_key', 'is_active'];

async function buildXlsx(headers, rows = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('products');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildApp(overrides = {}) {
  const productsService = require('../../../services/products.service');
  const brandsService = require('../../../services/brands.service');

  const defaultProducts = {
    listProducts: async () => ({ items: [], total: 0 }),
    getProductById: async () => null,
    isSkuTaken: async () => false,
    isNameTaken: async () => false,
    createProduct: async () => ({}),
    updateProduct: async () => ({}),
    toggleProductActive: async () => ({}),
  };
  const defaultBrands = {
    listActiveBrands: async () => [],
    listAllBrandsSimple: async () => [],
    getBrandById: async () => null,
  };

  Object.assign(productsService, defaultProducts, overrides.products || {});
  Object.assign(brandsService, defaultBrands, overrides.brands || {});

  delete require.cache[require.resolve('./products.routes')];
  const router = require('./products.routes');

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

test('allows product creation without sku code', async () => {
  const createProduct = mock.fn(async () => ({}));

  const { app } = buildApp({
    products: { createProduct },
    brands: {
      listActiveBrands: async () => [{ id: 1, name: 'Active', is_active: true }],
      getBrandById: async () => ({ id: 1, name: 'Active', is_active: true }),
    },
  });

  const res = await request(app)
    .post('/admin/definitions/products')
    .type('form')
    .send({ brand_id: '1', name: 'Prod', aliases: 'a,b' });

  assert.equal(res.status, 302);
  assert.match(res.headers.location, /ok=/);
  assert.equal(createProduct.mock.calls.length, 1);
  assert.equal(createProduct.mock.calls[0].arguments[0].skuCode, null);
  assert.deepEqual(createProduct.mock.calls[0].arguments[0].aliases, ['a', 'b']);
});

test('blocks inactive brand on create', async () => {
  const createProduct = mock.fn(async () => ({}));

  const { app } = buildApp({
    products: { createProduct },
    brands: {
      listActiveBrands: async () => [{ id: 2, name: 'Inactive', is_active: false }],
      getBrandById: async () => ({ id: 2, name: 'Inactive', is_active: false }),
    },
  });

  const res = await request(app)
    .post('/admin/definitions/products')
    .type('form')
    .send({ brand_id: '2', sku_code: 'SKU-1', name: 'Prod' });

  assert.equal(res.status, 200);
  assert.match(res.text, /برند انتخاب‌شده باید فعال باشد/);
  assert.equal(createProduct.mock.calls.length, 0);
});

test('blocks duplicate sku on create with friendly message', async () => {
  const createProduct = mock.fn(async () => ({}));

  const { app } = buildApp({
    products: {
      createProduct,
      isSkuTaken: async () => true,
      isNameTaken: async () => false,
    },
    brands: {
      listActiveBrands: async () => [{ id: 1, name: 'Active', is_active: true }],
      getBrandById: async () => ({ id: 1, name: 'Active', is_active: true }),
    },
  });

  const res = await request(app)
    .post('/admin/definitions/products')
    .type('form')
    .send({ brand_id: '1', sku_code: 'SKU-1', name: 'Prod' });

  assert.equal(res.status, 200);
  assert.match(res.text, /کد کالا تکراری/);
  assert.equal(createProduct.mock.calls.length, 0);
});

test('allows keeping inactive brand on edit', async () => {
  const updateProduct = mock.fn(async () => ({}));

  const { app } = buildApp({
    products: {
      getProductById: async () => ({ id: 5, brand_id: 7, sku_code: 'OLD', name: 'Old P', is_active: true }),
      updateProduct,
      isSkuTaken: async () => false,
    },
    brands: {
      listActiveBrands: async () => [],
      getBrandById: async () => ({ id: 7, name: 'OldBrand', is_active: false }),
    },
  });

  await request(app)
    .post('/admin/definitions/products/5')
    .type('form')
    .send({ brand_id: '7', sku_code: 'NEW', name: 'New Name', is_active: 'on' })
    .expect(302)
    .expect('Location', /ok=/);

  assert.equal(updateProduct.mock.calls.length, 1);
  assert.equal(updateProduct.mock.calls[0].arguments[0].brandId, 7);
});

test('list route forwards filters to service', async () => {
  const listProducts = mock.fn(async () => ({ items: [], total: 0 }));

  const { app } = buildApp({
    products: { listProducts },
    brands: { listAllBrandsSimple: async () => [] },
  });

  await request(app)
    .get('/admin/definitions/products?brand_id=3&q=abc')
    .expect(200);

  assert.equal(listProducts.mock.calls.length, 1);
  const args = listProducts.mock.calls[0].arguments[0];
  assert.equal(args.brandId, 3);
  assert.equal(args.search, 'abc');
});

test('serves xlsx template with expected headers', async () => {
  const { app } = buildApp();

  const res = await request(app)
    .get('/admin/definitions/products/template.xlsx')
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
  const sheet = wb.getWorksheet('products');
  const headerRow = sheet ? sheet.getRow(1).values.slice(1) : [];
  assert.deepEqual(headerRow, TEMPLATE_HEADERS_FA);
  assert.equal(sheet.rowCount >= 3, true);
  const sampleRow = sheet.getRow(2).values.slice(1);
  assert.equal(sampleRow[0], 'BR-100');
  assert.match(String(sampleRow[2]), /نوشابه/);
});

test('rejects import with invalid headers', async () => {
  const upsertProducts = mock.fn(async () => ({}));
  const { app } = buildApp({
    products: { upsertProducts },
    brands: { listAllBrandsSimple: async () => [] },
  });

  const buf = await buildXlsx(['wrong'], [['x']]);

  const res = await request(app)
    .post('/admin/definitions/products/import')
    .attach('file', buf, 'bad.xlsx')
    .expect(302);

  assert.match(res.headers.location, /err=/);
  assert.equal(upsertProducts.mock.calls.length, 0);
});

test('imports valid rows and upserts products', async () => {
  const upsertProducts = mock.fn(async () => ({ inserted: 1, updated: 1 }));
  const { app } = buildApp({
    products: { upsertProducts },
    brands: { listAllBrandsSimple: async () => [{ id: 2, code: 'BR2', name: 'Brand 2', is_active: true }] },
  });

  const buf = await buildXlsx(TEMPLATE_HEADERS_FA, [
    ['BR2', 'برند ۲', 'محصول ۱', 'SKU-1', 'الف,ب', 'بله', 'بله'],
    ['BR2', 'برند ۲', 'محصول ۲', '', '', 'خیر', '0'],
  ]);

  const res = await request(app)
    .post('/admin/definitions/products/import')
    .attach('file', buf, 'good.xlsx')
    .expect(302)
    .expect('Location', /ok=/);

  assert.ok(res.headers.location.includes('ok='));
  assert.equal(upsertProducts.mock.calls.length, 1);
  const rows = upsertProducts.mock.calls[0].arguments[0];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].brandId, 2);
  assert.equal(rows[0].aliases.length, 2);
  assert.equal(rows[0].isActive, true);
  assert.equal(rows[0].isKey, true);
  assert.equal(rows[1].isActive, false);
  assert.equal(rows[1].isKey, false);
});

test('imports rows with legacy english headers for backward compatibility', async () => {
  const upsertProducts = mock.fn(async () => ({ inserted: 2, updated: 0 }));
  const { app } = buildApp({
    products: { upsertProducts },
    brands: { listAllBrandsSimple: async () => [{ id: 4, code: 'BR4', name: 'Brand 4', is_active: true }] },
  });

  const buf = await buildXlsx(TEMPLATE_HEADERS_EN, [
    ['BR4', 'Brand 4', 'Prod EN 1', 'SKU-EN-1', 'tag1, tag2', 'yes', 'yes'],
    ['BR4', 'Brand 4', 'Prod EN 2', '', '', 'no', 'no'],
  ]);

  const res = await request(app)
    .post('/admin/definitions/products/import')
    .attach('file', buf, 'legacy.xlsx')
    .expect(302)
    .expect('Location', /ok=/);

  assert.ok(res.headers.location.includes('ok='));
  assert.equal(upsertProducts.mock.calls.length, 1);
  const rows = upsertProducts.mock.calls[0].arguments[0];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].brandId, 4);
  assert.equal(rows[0].isActive, true);
  assert.equal(rows[1].isKey, false);
});

test('imports valid rows even when some rows are invalid', async () => {
  const upsertProducts = mock.fn(async () => ({ inserted: 1, updated: 0 }));
  const { app } = buildApp({
    products: { upsertProducts, getProductsBySkuCodes: async () => [] },
    brands: { listAllBrandsSimple: async () => [{ id: 2, code: 'BR2', name: 'Brand 2', is_active: true }] },
  });
  const agent = request.agent(app);

  const buf = await buildXlsx(TEMPLATE_HEADERS_FA, [
    ['BR2', 'Brand 2', 'Valid Product', 'SKU-1', '', 'yes', 'yes'],
    ['', 'Brand 2', 'Missing brand code', '', '', 'no', 'no'],
  ]);

  const res = await agent.post('/admin/definitions/products/import').attach('file', buf, 'mixed.xlsx').expect(302);

  assert.match(res.headers.location, /ok=/);
  assert.equal(upsertProducts.mock.calls.length, 1);
  const rows = upsertProducts.mock.calls[0].arguments[0];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Valid Product');
});
