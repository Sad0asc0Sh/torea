const test = require('node:test');
const assert = require('node:assert');

const router = require('./index');

test('balance router exposes expected paths under /balance', () => {
  const paths = new Set(
    (router.stack || [])
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path)
  );

  const expectedPaths = [
    '/balance',
    '/balance/credit-requests',
    '/balance/credit-requests/new',
    '/balance/debts',
    '/balance/debts/import',
    '/balance/debts/import/preview',
    '/balance/debts/import/confirm',
    '/balance/debts/template.xlsx',
    '/balance/settlement-requests',
    '/balance/settlement-requests/new',
    '/balance/credit-requests/:id/decision',
    '/balance/settlement-requests/:id/decision',
  ];

  for (const p of expectedPaths) {
    assert.ok(paths.has(p), `missing route path: ${p}`);
  }

  for (const p of paths) {
    assert.ok(!p.startsWith('/admin/balance'), `unexpected admin-prefixed path: ${p}`);
  }
});
