'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const dbPath = path.join(__dirname, '../../../src/config/db.js');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async () => {
      throw new Error('db stub');
    },
    connect: async () => ({
      query: async () => {},
      release() {},
    }),
  },
};

const { buildTree } = require('../../../src/services/catalog.service');

function findNode(flatAll, key) {
  return flatAll.find((n) => n.key === key);
}

const baseItems = [
  { key: 'root', title: 'Root', parent_key: null, route_admin: '/root', route_user: '/root', order_index: 1 },
  { key: 'child', title: 'Child', parent_key: 'root', route_admin: '/child', route_user: '/child', order_index: 2 },
  { key: 'grand', title: 'Grand', parent_key: 'child', route_admin: '/grand', route_user: '/grand', order_index: 3 },
];

test('buildTree applies inheritance when parent is granted', () => {
  const accessMap = new Map([
    ['root', { visible: true }],
  ]);
  const result = buildTree(baseItems, { mode: 'USER', accessMap, preferAdminRoutes: true });
  const root = findNode(result.flatAll, 'root');
  const child = findNode(result.flatAll, 'child');
  const grand = findNode(result.flatAll, 'grand');

  assert.ok(root?.effective);
  assert.ok(child?.effective);
  assert.ok(grand?.effective);
  assert.equal(child?.inherited, true);
  assert.equal(grand?.inherited, true);
  assert.ok(result.allowedRoutes.includes('/root'));
  assert.ok(result.allowedRoutes.includes('/child'));
});

test('buildTree allows child override when parent is not granted', () => {
  const accessMap = new Map([
    ['grand', { visible: true }],
  ]);
  const result = buildTree(baseItems, { mode: 'USER', accessMap, preferAdminRoutes: true });
  const root = findNode(result.flatAll, 'root');
  const child = findNode(result.flatAll, 'child');
  const grand = findNode(result.flatAll, 'grand');

  assert.equal(root?.effective, false);
  assert.equal(child?.effective, false);
  assert.equal(grand?.effective, true);
  assert.equal(grand?.inherited, false);
  assert.ok(result.menu.some((m) => m.key === 'grand'));
});

test('actions are not inherited from parent visibility', () => {
  const accessMap = new Map([
    ['grand', { visible: true }],
  ]);
  const itemsWithAction = baseItems.concat([
    { key: 'grand.edit', title: 'Edit grand', type: 'action', parent_key: 'grand', route_admin: '/grand/:id/edit', route_user: '/grand/:id/edit', order_index: 4 },
  ]);
  const result = buildTree(itemsWithAction, { mode: 'USER', accessMap, preferAdminRoutes: true });
  const actionNode = findNode(result.flatAll, 'grand.edit');
  assert.equal(actionNode?.effective, false);
});
