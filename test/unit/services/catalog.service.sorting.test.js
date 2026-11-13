'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Unit tests for catalog sync topological sorting
 * These tests verify that the sorting logic ensures parents are always inserted before children
 */

// Helper function to calculate hierarchy depth (for testing)
// Test version with cycle detection - mirrors production behavior
// Note: Uses find() for simplicity in tests. Production code uses Map for O(1) lookups.
function getDepth(item, allItems, visited = new Set()) {
  if (!item.parent_key) return 0;
  if (visited.has(item.key)) return 0; // Cycle detection
  visited.add(item.key);
  const parent = allItems.find(i => i.key === item.parent_key);
  const depth = parent ? getDepth(parent, allItems, visited) + 1 : 0;
  visited.delete(item.key);
  return depth;
}

// Sorting function (same as in catalog.service.js)
function sortByHierarchyDepth(items) {
  return [...items].sort((a, b) => {
    const depthA = getDepth(a, items);
    const depthB = getDepth(b, items);
    if (depthA !== depthB) return depthA - depthB;
    return (a.order_index || 0) - (b.order_index || 0);
  });
}

// Validation function to check if sorting is correct
function validateSortOrder(items) {
  const seenKeys = new Set();
  for (const item of items) {
    if (item.parent_key && !seenKeys.has(item.parent_key)) {
      return { valid: false, error: `${item.key} appears before its parent ${item.parent_key}` };
    }
    seenKeys.add(item.key);
  }
  return { valid: true };
}

test('sortByHierarchyDepth: root items (no parent) should come first', () => {
  const items = [
    { key: 'child', parent_key: 'root', order_index: 2 },
    { key: 'root', parent_key: null, order_index: 1 },
  ];
  
  const sorted = sortByHierarchyDepth(items);
  
  assert.equal(sorted[0].key, 'root');
  assert.equal(sorted[1].key, 'child');
});

test('sortByHierarchyDepth: handles multi-level hierarchy correctly', () => {
  const items = [
    { key: 'level3', parent_key: 'level2', order_index: 4 },
    { key: 'level2', parent_key: 'level1', order_index: 3 },
    { key: 'root', parent_key: null, order_index: 1 },
    { key: 'level1', parent_key: 'root', order_index: 2 },
  ];
  
  const sorted = sortByHierarchyDepth(items);
  const validation = validateSortOrder(sorted);
  
  assert.ok(validation.valid, validation.error);
  assert.equal(sorted[0].key, 'root');
  assert.equal(sorted[1].key, 'level1');
  assert.equal(sorted[2].key, 'level2');
  assert.equal(sorted[3].key, 'level3');
});

test('sortByHierarchyDepth: handles multiple root items', () => {
  const items = [
    { key: 'root2.child', parent_key: 'root2', order_index: 4 },
    { key: 'root1', parent_key: null, order_index: 1 },
    { key: 'root2', parent_key: null, order_index: 2 },
    { key: 'root1.child', parent_key: 'root1', order_index: 3 },
  ];
  
  const sorted = sortByHierarchyDepth(items);
  const validation = validateSortOrder(sorted);
  
  assert.ok(validation.valid, validation.error);
  
  // Check depths
  assert.equal(getDepth(sorted[0], items), 0);
  assert.equal(getDepth(sorted[1], items), 0);
  assert.equal(getDepth(sorted[2], items), 1);
  assert.equal(getDepth(sorted[3], items), 1);
});

test('sortByHierarchyDepth: respects order_index within same depth', () => {
  const items = [
    { key: 'root', parent_key: null, order_index: 1 },
    { key: 'child3', parent_key: 'root', order_index: 30 },
    { key: 'child1', parent_key: 'root', order_index: 10 },
    { key: 'child2', parent_key: 'root', order_index: 20 },
  ];
  
  const sorted = sortByHierarchyDepth(items);
  
  assert.equal(sorted[0].key, 'root');
  assert.equal(sorted[1].key, 'child1');
  assert.equal(sorted[2].key, 'child2');
  assert.equal(sorted[3].key, 'child3');
});

test('sortByHierarchyDepth: handles real catalog structure', () => {
  const items = [
    { key: 'admin.tools.training', parent_key: 'admin.tools', order_index: 23 },
    { key: 'admin', parent_key: null, order_index: 1 },
    { key: 'admin.definitions.teams.edit', parent_key: 'admin.definitions.teams', order_index: 1203 },
    { key: 'admin.definitions', parent_key: 'admin', order_index: 10 },
    { key: 'admin.tools', parent_key: 'admin', order_index: 20 },
    { key: 'admin.definitions.teams', parent_key: 'admin.definitions', order_index: 12 },
    { key: 'inbox', parent_key: null, order_index: 25 },
    { key: 'inbox.automation', parent_key: 'inbox', order_index: 1 },
  ];
  
  const sorted = sortByHierarchyDepth(items);
  const validation = validateSortOrder(sorted);
  
  assert.ok(validation.valid, validation.error);
  
  // Verify specific ordering requirements
  const indexMap = new Map(sorted.map((item, idx) => [item.key, idx]));
  
  // admin should come before admin.definitions
  assert.ok(indexMap.get('admin') < indexMap.get('admin.definitions'));
  
  // admin.definitions should come before admin.definitions.teams
  assert.ok(indexMap.get('admin.definitions') < indexMap.get('admin.definitions.teams'));
  
  // admin.definitions.teams should come before admin.definitions.teams.edit
  assert.ok(indexMap.get('admin.definitions.teams') < indexMap.get('admin.definitions.teams.edit'));
  
  // inbox should come before inbox.automation
  assert.ok(indexMap.get('inbox') < indexMap.get('inbox.automation'));
});

test('sortByHierarchyDepth: handles items with missing order_index', () => {
  const items = [
    { key: 'child', parent_key: 'root' }, // no order_index
    { key: 'root', parent_key: null, order_index: 1 },
  ];
  
  const sorted = sortByHierarchyDepth(items);
  const validation = validateSortOrder(sorted);
  
  assert.ok(validation.valid, validation.error);
  assert.equal(sorted[0].key, 'root');
  assert.equal(sorted[1].key, 'child');
});

test('getDepth: returns 0 for root items', () => {
  const items = [
    { key: 'root', parent_key: null },
  ];
  
  assert.equal(getDepth(items[0], items), 0);
});

test('getDepth: calculates correct depth for nested items', () => {
  const items = [
    { key: 'root', parent_key: null },
    { key: 'level1', parent_key: 'root' },
    { key: 'level2', parent_key: 'level1' },
    { key: 'level3', parent_key: 'level2' },
  ];
  
  assert.equal(getDepth(items[0], items), 0);
  assert.equal(getDepth(items[1], items), 1);
  assert.equal(getDepth(items[2], items), 2);
  assert.equal(getDepth(items[3], items), 3);
});

test('validateSortOrder: detects when child comes before parent', () => {
  const items = [
    { key: 'child', parent_key: 'root' },
    { key: 'root', parent_key: null },
  ];
  
  const validation = validateSortOrder(items);
  
  assert.equal(validation.valid, false);
  assert.ok(validation.error.includes('child'));
  assert.ok(validation.error.includes('root'));
});

test('validateSortOrder: passes when order is correct', () => {
  const items = [
    { key: 'root', parent_key: null },
    { key: 'child', parent_key: 'root' },
  ];
  
  const validation = validateSortOrder(items);
  
  assert.ok(validation.valid);
});

test('getDepth: handles circular references gracefully', () => {
  const items = [
    { key: 'a', parent_key: 'b' },
    { key: 'b', parent_key: 'c' },
    { key: 'c', parent_key: 'a' }, // circular reference
  ];
  
  // The function should handle this without infinite recursion
  // Implementation should detect cycle and return 0 for safety
  const visited = new Set();
  const depth = getDepth(items[0], items, visited);
  
  // Should not throw or hang - any non-negative depth is acceptable
  assert.ok(typeof depth === 'number');
  assert.ok(depth >= 0);
});

test('sortByHierarchyDepth: handles circular references without hanging', () => {
  const items = [
    { key: 'normal', parent_key: null, order_index: 1 },
    { key: 'a', parent_key: 'b', order_index: 2 },
    { key: 'b', parent_key: 'a', order_index: 3 }, // circular
  ];
  
  // Should complete without hanging or throwing
  const sorted = sortByHierarchyDepth(items);
  
  assert.equal(sorted.length, items.length);
  // Normal item should be first (root level)
  assert.equal(sorted[0].key, 'normal');
});
