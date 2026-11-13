'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const authServicePath = path.join(__dirname, '../../../src/services/auth.service.js');

let getUserStub = async () => null;
require.cache[authServicePath] = {
  id: authServicePath,
  filename: authServicePath,
  loaded: true,
  exports: {
    getUserByUsername: (...args) => getUserStub(...args),
  },
};

const enforceAuthFlow = require('../../../src/middlewares/enforceAuthFlow');

function createRes() {
  const res = { locals: {} };
  res.redirectedTo = null;
  res.redirect = (target) => {
    res.redirectedTo = target;
    return res;
  };
  return res;
}

test('redirects to /pre-register-info when telegram_id missing', async () => {
  getUserStub = async () => ({
    id: 1,
    username: 'alice',
    telegram_id: null,
    status: 'approved',
    active: true,
    role: 'USER',
  });

  const req = { session: { user: { username: 'alice', role: 'USER' } }, baseUrl: '/admin', path: '/dashboard' };
  const res = createRes();
  let nextCalled = false;

  await enforceAuthFlow(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.redirectedTo, '/pre-register-info');
});

test('redirects to /auth/telegram for pending telegram statuses', async () => {
  getUserStub = async () => ({
    id: 2,
    username: 'bob',
    telegram_id: '123',
    status: 'pending_telegram',
    active: true,
    role: 'USER',
  });

  const req = { session: { user: { username: 'bob', role: 'USER' } }, baseUrl: '/admin', path: '/dashboard' };
  const res = createRes();
  let nextCalled = false;

  await enforceAuthFlow(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.redirectedTo, '/auth/telegram');
});

test('allows verified user to proceed', async () => {
  getUserStub = async () => ({
    id: 3,
    username: 'carol',
    telegram_id: '999',
    status: 'approved',
    active: true,
    role: 'USER',
    first_name: 'Carol',
    last_name: 'Doe',
  });

  const req = { session: { user: { username: 'carol', role: 'USER' } }, baseUrl: '/admin', path: '/dashboard' };
  const res = createRes();
  let nextCalled = false;

  await enforceAuthFlow(req, res, () => { nextCalled = true; });

  assert.equal(res.redirectedTo, null);
  assert.equal(nextCalled, true);
  assert.equal(req.session.user.display_name, 'Carol Doe');
});

test('bypasses middleware for SYSTEM_ADMIN', async () => {
  getUserStub = async () => {
    throw new Error('should not load user for SYSTEM_ADMIN');
  };

  const req = { session: { user: { username: 'root', role: 'SYSTEM_ADMIN' } }, baseUrl: '/admin', path: '/dashboard' };
  const res = createRes();
  let nextCalled = false;

  await enforceAuthFlow(req, res, () => { nextCalled = true; });

  assert.equal(res.redirectedTo, null);
  assert.equal(nextCalled, true);
});
