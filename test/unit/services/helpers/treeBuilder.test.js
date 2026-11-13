'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTreeStructure, flattenTree } = require('../../../../src/services/helpers/treeBuilder.helper');

test('treeBuilder.helper - buildTreeStructure with flat items', () => {
  const items = [
    { key: 'admin', title: 'Admin', parent_key: null, order_index: 0 },
    { key: 'admin.settings', title: 'Settings', parent_key: 'admin', order_index: 1 },
    { key: 'admin.dashboard', title: 'Dashboard', parent_key: 'admin', order_index: 0 },
    { key: 'admin.settings.catalog', title: 'Catalog', parent_key: 'admin.settings', order_index: 0 }
  ];

  const tree = buildTreeStructure(items);
  
  assert.ok(Array.isArray(tree), 'should return an array');
  assert.strictEqual(tree.length, 1, 'should have one root item');
  assert.strictEqual(tree[0].key, 'admin', 'root should be admin');
  assert.ok(Array.isArray(tree[0].children), 'root should have children array');
  assert.strictEqual(tree[0].children.length, 2, 'admin should have 2 children');
  
  // Check sorting by order_index
  assert.strictEqual(tree[0].children[0].key, 'admin.dashboard', 'first child should be dashboard (order_index 0)');
  assert.strictEqual(tree[0].children[1].key, 'admin.settings', 'second child should be settings (order_index 1)');
  
  // Check nested children
  const settings = tree[0].children[1];
  assert.strictEqual(settings.children.length, 1, 'settings should have 1 child');
  assert.strictEqual(settings.children[0].key, 'admin.settings.catalog', 'settings child should be catalog');
  assert.strictEqual(settings.has_children, true, 'settings should be marked as has_children');
});

test('treeBuilder.helper - buildTreeStructure with orphaned items', () => {
  const items = [
    { key: 'admin', title: 'Admin', parent_key: null, order_index: 0 },
    { key: 'admin.orphan', title: 'Orphan', parent_key: 'admin.nonexistent', order_index: 0 }
  ];

  const tree = buildTreeStructure(items);
  
  assert.strictEqual(tree.length, 2, 'should have 2 root items (including orphan)');
  
  const orphan = tree.find(item => item.key === 'admin.orphan');
  assert.ok(orphan, 'orphan should be in roots');
});

test('treeBuilder.helper - buildTreeStructure with empty array', () => {
  const tree = buildTreeStructure([]);
  
  assert.ok(Array.isArray(tree), 'should return an array');
  assert.strictEqual(tree.length, 0, 'should be empty');
});

test('treeBuilder.helper - flattenTree with tree structure', () => {
  const tree = [
    {
      key: 'admin',
      title: 'Admin',
      children: [
        {
          key: 'admin.dashboard',
          title: 'Dashboard',
          children: []
        },
        {
          key: 'admin.settings',
          title: 'Settings',
          children: [
            {
              key: 'admin.settings.catalog',
              title: 'Catalog',
              children: []
            }
          ]
        }
      ]
    }
  ];

  const flat = flattenTree(tree);
  
  assert.ok(Array.isArray(flat), 'should return an array');
  assert.strictEqual(flat.length, 4, 'should have 4 items');
  
  // Check depth values
  assert.strictEqual(flat[0].key, 'admin');
  assert.strictEqual(flat[0].depth, 0, 'admin should have depth 0');
  
  assert.strictEqual(flat[1].key, 'admin.dashboard');
  assert.strictEqual(flat[1].depth, 1, 'dashboard should have depth 1');
  
  assert.strictEqual(flat[2].key, 'admin.settings');
  assert.strictEqual(flat[2].depth, 1, 'settings should have depth 1');
  
  assert.strictEqual(flat[3].key, 'admin.settings.catalog');
  assert.strictEqual(flat[3].depth, 2, 'catalog should have depth 2');
  
  // Check that children arrays are not in flattened output
  assert.strictEqual(flat[0].children, undefined, 'flattened items should not have children array');
});

test('treeBuilder.helper - flattenTree with empty tree', () => {
  const flat = flattenTree([]);
  
  assert.ok(Array.isArray(flat), 'should return an array');
  assert.strictEqual(flat.length, 0, 'should be empty');
});

test('treeBuilder.helper - sorting by title when order_index is same', () => {
  const items = [
    { key: 'admin', title: 'Admin', parent_key: null, order_index: 0 },
    { key: 'admin.zebra', title: 'Zebra', parent_key: 'admin', order_index: 0 },
    { key: 'admin.apple', title: 'Apple', parent_key: 'admin', order_index: 0 },
    { key: 'admin.banana', title: 'Banana', parent_key: 'admin', order_index: 0 }
  ];

  const tree = buildTreeStructure(items);
  
  assert.strictEqual(tree[0].children[0].key, 'admin.apple', 'first should be apple (alphabetically)');
  assert.strictEqual(tree[0].children[1].key, 'admin.banana', 'second should be banana');
  assert.strictEqual(tree[0].children[2].key, 'admin.zebra', 'third should be zebra');
});
