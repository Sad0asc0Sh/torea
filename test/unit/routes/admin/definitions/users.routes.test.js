const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

function buildApp({
  listUsersWithOrgTitle,
  getUserById,
  listDistinctRoles,
  updateUserNoPassword,
  updateUserWithPassword,
  listOrgNodes,
  listUsersWithOrgNode,
  isAccountingCodeTaken,
} = {}) {
  const usersService = require('../../../services/users.service');

  usersService.listUsersWithOrgTitle = listUsersWithOrgTitle || (async () => []);
  usersService.getUserById = getUserById || (async () => null);
  usersService.listDistinctRoles = listDistinctRoles || (async () => []);
  usersService.updateUserNoPassword = updateUserNoPassword || (async () => {});
  usersService.updateUserWithPassword = updateUserWithPassword || (async () => {});
  usersService.listOrgNodes = listOrgNodes || (async () => []);
  usersService.listUsersWithOrgNode = listUsersWithOrgNode || (async () => []);
  usersService.isAccountingCodeTaken = isAccountingCodeTaken || (async () => false);

  delete require.cache[require.resolve('./users.routes')];
  const router = require('./users.routes');

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

  // fake session admin
  app.use((req, res, next) => {
    req.session.user = { id: 1, username: 'sys', role: 'SYSTEM_ADMIN' };
    next();
  });

  app.use('/admin', router);
  return { app };
}

test('POST forces pending_telegram when telegram changes and keeps list working', async () => {
  const listUsersWithOrgTitle = mock.fn(async () => [
    {
      id: 1,
      username: 'alpha',
      first_name: 'Ali',
      last_name: 'Rezaei',
      role: 'USER',
      status: 'active',
      active: true,
      org_node_title: 'Org Two',
    },
  ]);

  const getUserById = mock.fn(async () => ({
    id: 1,
    username: 'alpha',
    first_name: 'Ali',
    last_name: 'Rezaei',
    phone: '0912',
    telegram_id: '@old',
    role: 'USER',
    status: 'active',
    active: true,
    org_node_id: 2,
  }));

  const listDistinctRoles = mock.fn(async () => ['USER']);
  const updateUserNoPassword = mock.fn(async () => {});
  const listOrgNodes = mock.fn(async () => [{ id: 2, title: 'Org', parent_id: null }]);

  const { app } = buildApp({
    listUsersWithOrgTitle,
    getUserById,
    listDistinctRoles,
    updateUserNoPassword,
    listOrgNodes,
  });

  await request(app)
    .post('/admin/definitions/users/1')
    .type('form')
    .send({
      first_name: 'Ali',
      last_name: 'Rezaei',
      phone: '123',
      telegram_id: '@new',
      is_active: 'on',
      manager_approved: 'on',
      role: 'USER',
      org_node_id: '2',
    })
    .expect(302)
    .expect('Location', '/admin/definitions/users');

  assert.equal(updateUserNoPassword.mock.calls.length, 1);
  const payload = updateUserNoPassword.mock.calls[0].arguments[0];
  assert.equal(payload.statusToSave, 'pending_telegram');
  assert.equal(payload.activeBool, false);

  const res = await request(app).get('/admin/definitions/users');
  assert.equal(res.status, 200);
  assert.match(res.text, /Org Two/);
});

test('renders first and last name without using full_name', async () => {
  const listUsersWithOrgTitle = mock.fn(async () => [
    {
      id: 3,
      username: 'mix',
      first_name: 'Only',
      last_name: 'Name',
      full_name: 'SHOULD_NOT_USE',
      role: 'USER',
      status: 'pending_verification',
      active: false,
      org_node_title: 'Branch',
    },
  ]);

  const getUserById = mock.fn(async () => ({
    id: 3,
    username: 'mix',
    first_name: 'Only',
    last_name: 'Name',
    phone: '',
    role: 'USER',
    status: 'pending_verification',
    active: false,
    org_node_id: null,
  }));

  const listDistinctRoles = mock.fn(async () => ['USER']);
  const updateUserNoPassword = mock.fn(async () => {});

  const { app } = buildApp({
    listUsersWithOrgTitle,
    getUserById,
    listDistinctRoles,
    updateUserNoPassword,
  });

  const res = await request(app).get('/admin/definitions/users');
  assert.equal(res.status, 200);
  assert.match(res.text, /Only/);
  assert.match(res.text, /Name/);
  assert.ok(!res.text.includes('SHOULD_NOT_USE'));
});

test('edit page renders single active and manager checkboxes', async () => {
  const listUsersWithOrgTitle = mock.fn(async () => []);
  const getUserById = mock.fn(async () => ({
    id: 7,
    username: 'dup',
    first_name: 'Dupe',
    last_name: 'Check',
    phone: '0912',
    telegram_id: '@dup',
    role: 'USER',
    status: 'pending_manager',
    active: false,
  }));

  const listDistinctRoles = mock.fn(async () => ['USER', 'ADMIN']);
  const updateUserNoPassword = mock.fn(async () => {});

  const { app } = buildApp({
    listUsersWithOrgTitle,
    getUserById,
    listDistinctRoles,
    updateUserNoPassword,
  });

  const res = await request(app).get('/admin/definitions/users/7/edit');
  assert.equal(res.status, 200);

  assert.equal((res.text.match(/name="is_active"/g) || []).length, 1);
  assert.equal((res.text.match(/name="manager_approved"/g) || []).length, 1);

  assert.ok(res.text.includes('name="telegram_id"'));
  assert.ok(res.text.includes('name="password"'));
});
