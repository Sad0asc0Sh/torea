const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const request = require('supertest');

test('Catalog Manager routes load successfully', async () => {
  const router = require('../../../../../src/routes/admin/settings/catalogManager.routes');
  assert.ok(router, 'Router should be defined');
  assert.ok(typeof router === 'function', 'Router should be a function');
});

test('GET /admin/settings/catalog-manager returns 200', async () => {
  const catalogDiscovery = require('../../../../../src/services/catalogDiscovery.service');
  const restoreDiscovery = mock.method(catalogDiscovery, 'discoverAllCatalogItems', async () => ({
    items: [
      { key: 'admin.dashboard', title: 'Dashboard', type: 'page', is_active: true, is_new: false, source_label: 'Route', display_title: 'Dashboard' }
    ],
    flat: [
      { key: 'admin.dashboard', title: 'Dashboard', type: 'page', is_active: true, is_new: false, is_existing: true, source_label: 'Route', display_title: 'Dashboard', depth: 0, has_children: false, route_admin: '/admin/dashboard' }
    ],
    stats: {
      total: 1,
      new: 0,
      active: 1,
      hidden: 0,
      sources: { route: 1, ejs: 0, database: 0 }
    },
    timestamp: '2025-01-01T00:00:00.000Z'
  }));

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../../../src/views'));
  app.use((req, res, next) => {
    req.session = { user: { id: 1, username: 'admin', role: 'ADMIN' } };
    res.locals.user = req.session.user;
    next();
  });

  const router = require('../../../../../src/routes/admin/settings/catalogManager.routes');
  app.use('/admin', router);

  try {
    const res = await request(app).get('/admin/settings/catalog-manager').expect(200);
    assert.match(res.text, /مدیریت هوشمند کاتالوگ/);
    assert.match(res.text, /catalog-form/);
    assert.match(res.text, /tree-table/);
  } finally {
    restoreDiscovery.mock.restore();
  }
});

test('POST /admin/settings/catalog-manager/quick-edit validates required fields', async () => {
  const pool = require('../../../../../src/config/db');
  const restorePool = mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: 1, username: 'admin', role: 'ADMIN' } };
    next();
  });

  const router = require('../../../../../src/routes/admin/settings/catalogManager.routes');
  app.use('/admin', router);

  try {
    // Missing key parameter
    const res = await request(app)
      .post('/admin/settings/catalog-manager/quick-edit')
      .send({ field: 'title', value: 'New Title' })
      .expect(400);

    const data = JSON.parse(res.text);
    assert.strictEqual(data.ok, false);
    assert.match(data.error, /الزامی/);
  } finally {
    restorePool.mock.restore();
  }
});

test('POST /admin/settings/catalog-manager/quick-edit rejects invalid fields', async () => {
  const pool = require('../../../../../src/config/db');
  const restorePool = mock.method(pool, 'query', async () => ({ rows: [], rowCount: 1 }));

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: 1, username: 'admin', role: 'ADMIN' } };
    next();
  });

  const router = require('../../../../../src/routes/admin/settings/catalogManager.routes');
  app.use('/admin', router);

  try {
    const res = await request(app)
      .post('/admin/settings/catalog-manager/quick-edit')
      .send({ key: 'admin.test', field: 'invalid_field', value: 'test' })
      .expect(400);

    const data = JSON.parse(res.text);
    assert.strictEqual(data.ok, false);
    assert.match(data.error, /قابل ویرایش نیست/);
  } finally {
    restorePool.mock.restore();
  }
});

test('GET /admin/settings/catalog-manager/api/stats returns JSON', async () => {
  const catalogDiscovery = require('../../../../../src/services/catalogDiscovery.service');
  const restoreDiscovery = mock.method(catalogDiscovery, 'discoverAllCatalogItems', async () => ({
    items: [],
    stats: { total: 5, new: 1, active: 4, hidden: 0, sources: {} },
    timestamp: '2025-01-01T00:00:00.000Z'
  }));

  const app = express();
  app.use((req, res, next) => {
    req.session = { user: { id: 1, username: 'admin', role: 'ADMIN' } };
    next();
  });

  const router = require('../../../../../src/routes/admin/settings/catalogManager.routes');
  app.use('/admin', router);

  try {
    const res = await request(app)
      .get('/admin/settings/catalog-manager/api/stats')
      .expect(200);

    const data = JSON.parse(res.text);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.stats.total, 5);
  } finally {
    restoreDiscovery.mock.restore();
  }
});

test('GET /admin/settings/catalog-manager/api/discover clears cache', async () => {
  const catalogDiscovery = require('../../../../../src/services/catalogDiscovery.service');
  const restoreClearCache = mock.method(catalogDiscovery, 'clearCache', () => {});
  const restoreDiscovery = mock.method(catalogDiscovery, 'discoverAllCatalogItems', async () => ({
    items: [],
    stats: { total: 10, new: 2, active: 8, hidden: 0, sources: {} },
    timestamp: '2025-01-01T00:00:00.000Z'
  }));

  const app = express();
  app.use((req, res, next) => {
    req.session = { user: { id: 1, username: 'admin', role: 'ADMIN' } };
    next();
  });

  const router = require('../../../../../src/routes/admin/settings/catalogManager.routes');
  app.use('/admin', router);

  try {
    const res = await request(app)
      .get('/admin/settings/catalog-manager/api/discover')
      .expect(200);

    const data = JSON.parse(res.text);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.stats.total, 10);
    assert.ok(data.timestamp);
    
    // Verify clearCache was called
    assert.strictEqual(restoreClearCache.mock.calls.length, 1);
  } finally {
    restoreClearCache.mock.restore();
    restoreDiscovery.mock.restore();
  }
});
