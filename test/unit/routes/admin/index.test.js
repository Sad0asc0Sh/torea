const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const request = require('supertest');

test('routes /admin/definitions/products through definitions handlers', async () => {
  const productsService = require('../../services/products.service');
  const brandsService = require('../../services/brands.service');

  const restoreProducts = mock.method(productsService, 'listProducts', async () => ({
    items: [{ id: 1, brand_id: 2, sku_code: null, name: 'Prod', aliases: [] }],
    total: 1,
  }));
  const restoreBrands = mock.method(
    brandsService,
    'listAllBrandsSimple',
    async () => [{ id: 2, name: 'Brand', is_active: true }]
  );

  const adminRouter = require('./index');

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../views'));
  app.use((req, res, next) => {
    req.session = { user: { id: 10, username: 'sys', role: 'SYSTEM_ADMIN' } };
    res.locals.user = req.session.user;
    next();
  });

  app.use('/admin', adminRouter);

  try {
    const res = await request(app).get('/admin/definitions/products').expect(200);
    assert.match(res.text, /تعریف کالاها/);
  } finally {
    restoreProducts.mock.restore();
    restoreBrands.mock.restore();
  }
});
