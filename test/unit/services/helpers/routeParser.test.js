'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseRouteFile, normalizeRoutePath } = require('../../../../src/services/helpers/routeParser.helper');

test('routeParser.helper - parseRouteFile with valid route file', () => {
  const fixturePath = path.join(__dirname, '../../../../test/fixtures/sample-route.js');
  const routes = parseRouteFile(fixturePath);
  
  assert.ok(Array.isArray(routes), 'should return an array');
  assert.ok(routes.length > 0, 'should find routes');
  
  // Should find GET routes
  const getDashboard = routes.find(r => r.path === '/admin/dashboard' && r.method === 'GET');
  assert.ok(getDashboard, 'should find GET /admin/dashboard');
  
  const getSettings = routes.find(r => r.path === '/admin/settings' && r.method === 'GET');
  assert.ok(getSettings, 'should find GET /admin/settings');
  
  // Should find POST routes too (filtering happens at higher level)
  const postSettings = routes.find(r => r.path === '/admin/settings' && r.method === 'POST');
  assert.ok(postSettings, 'should find POST /admin/settings');
});

test('routeParser.helper - parseRouteFile with non-existent file', () => {
  const routes = parseRouteFile('/non/existent/file.js');
  
  assert.ok(Array.isArray(routes), 'should return an array');
  assert.strictEqual(routes.length, 0, 'should return empty array');
});

test('routeParser.helper - normalizeRoutePath with various inputs', () => {
  assert.strictEqual(normalizeRoutePath('/admin/dashboard'), '/admin/dashboard');
  assert.strictEqual(normalizeRoutePath('admin/dashboard'), '/admin/dashboard');
  assert.strictEqual(normalizeRoutePath('/admin/dashboard/'), '/admin/dashboard');
  assert.strictEqual(normalizeRoutePath('///admin///dashboard///'), '/admin/dashboard');
  assert.strictEqual(normalizeRoutePath(''), '/');
  assert.strictEqual(normalizeRoutePath('/'), '/');
  assert.strictEqual(normalizeRoutePath('  /admin/test  '), '/admin/test');
});
