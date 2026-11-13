'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireLogin } = require('../../../src/middlewares/auth');

function createRes() {
  const res = {};
  res.redirectedTo = null;
  res.statusCode = null;
  res.jsonPayload = null;
  res.redirect = (target) => { res.redirectedTo = target; return res; };
  res.status = (code) => {
    res.statusCode = code;
    return {
      json: (payload) => { res.jsonPayload = payload; return res; },
    };
  };
  return res;
}

function withAuthEnv(fn) {
  const originalBypass = process.env.BYPASS_AUTH_FOR_TESTS;
  const originalEnv = process.env.NODE_ENV;
  process.env.BYPASS_AUTH_FOR_TESTS = 'false';
  process.env.NODE_ENV = 'development';
  return fn().finally(() => {
    process.env.BYPASS_AUTH_FOR_TESTS = originalBypass;
    process.env.NODE_ENV = originalEnv;
  });
}

test('requireLogin allows admin path when user session exists', () => withAuthEnv(async () => {
  const req = { session: { user: { id: 1, role: 'USER' } }, path: '/dashboard', baseUrl: '/admin' };
  const res = createRes();
  let nextCalled = false;

  requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(res.redirectedTo, null);
  assert.equal(nextCalled, true);
  assert.deepEqual(req.session.user, { id: 1, role: 'USER' });
  assert.deepEqual(req.user, { id: 1, role: 'USER' });
}));

test('requireLogin redirects admin path without session to /admin/login', () => withAuthEnv(async () => {
  const req = { path: '/dashboard', baseUrl: '/admin' };
  const res = createRes();
  let nextCalled = false;

  requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.redirectedTo, '/admin/login');
}));

test('requireLogin redirects non-admin path without session to /login', () => withAuthEnv(async () => {
  const req = { path: '/customers', baseUrl: '' };
  const res = createRes();
  let nextCalled = false;

  requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.redirectedTo, '/login');
}));
