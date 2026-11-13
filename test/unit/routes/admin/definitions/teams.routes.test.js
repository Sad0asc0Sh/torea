const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const { performance } = require('node:perf_hooks');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

function buildApp(overrides) {
  const teamsService = require('../../../services/teams.service');
  Object.assign(teamsService, overrides);

  delete require.cache[require.resolve('./teams.routes')];
  const router = require('./teams.routes');

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
  app.use((req, res, next) => {
    req.session.user = { id: 1, username: 'sys', role: 'SYSTEM_ADMIN' };
    next();
  });
  app.use('/admin', router);

  return { app };
}

test('renders teams list page', async () => {
  const listTeamsWithCounts = mock.fn(async () => [
    { id: 1, name: 'Ops', active: true, members_count: 3, brands_count: 1 },
  ]);

  const { app } = buildApp({ listTeamsWithCounts });

  const res = await request(app).get('/admin/definitions/teams');
  assert.equal(res.status, 200);
  assert.equal(listTeamsWithCounts.mock.calls.length, 1);
  assert.match(res.text, /تعریف تیم‌ها/);
  assert.match(res.text, /ایجاد تیم/);
});

test('rejects team creation when name is missing', async () => {
  const listTeamsWithCounts = mock.fn(async () => []);
  const listOrgNodes = mock.fn(async () => []);
  const isNameTaken = mock.fn(async () => false);
  const createTeam = mock.fn(async () => ({}));

  const { app } = buildApp({
    listTeamsWithCounts,
    listOrgNodes,
    isNameTaken,
    createTeam,
  });

  const res = await request(app)
    .post('/admin/definitions/teams')
    .type('form')
    .send({ name: '' });

  assert.equal(res.status, 200);
  assert.match(res.text, /نام تیم الزامی/);
  assert.equal(createTeam.mock.calls.length, 0);
});

test('blocks adding inactive user to team', async () => {
  const getTeamById = mock.fn(async () => ({ id: 7, name: 'Ops', is_active: true }));
  const findUserById = mock.fn(async () => ({
    id: '11111111-1111-4111-8111-111111111111',
    active: false,
    status: 'pending',
  }));
  const addMember = mock.fn(async () => ({}));

  const { app } = buildApp({
    getTeamById,
    findUserById,
    addMember,
  });

  await request(app)
    .post('/admin/definitions/teams/7/members/add')
    .type('form')
    .send({ user_id: '11111111-1111-4111-8111-111111111111' })
    .expect(302)
    .expect('Location', '/admin/definitions/teams/7/members?err=' + encodeURIComponent('کاربر فعال یافت نشد.'));

  assert.equal(addMember.mock.calls.length, 0);
});

test('allows adding pending_manager user when active', async () => {
  const getTeamById = mock.fn(async () => ({ id: 8, name: 'Ops', is_active: true }));
  const findUserById = mock.fn(async () => ({
    id: '33333333-3333-4333-8333-333333333333',
    active: true,
    status: 'pending_manager',
  }));
  const addMember = mock.fn(async () => ({}));

  const { app } = buildApp({
    getTeamById,
    findUserById,
    addMember,
  });

  await request(app)
    .post('/admin/definitions/teams/8/members/add')
    .type('form')
    .send({ user_id: '33333333-3333-4333-8333-333333333333' })
    .expect(302)
    .expect('Location', '/admin/definitions/teams/8/members?ok=' + encodeURIComponent('عضو به تیم اضافه شد.'));

  assert.equal(addMember.mock.calls.length, 1);
  assert.deepEqual(addMember.mock.calls[0].arguments, [8, '33333333-3333-4333-8333-333333333333']);
});

test('adds member without role branching', async () => {
  const getTeamById = mock.fn(async () => ({ id: 2, name: 'Sales', is_active: true }));
  const findUserById = mock.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222', active: true, status: 'active' }));
  const addMember = mock.fn(async () => ({}));

  const { app } = buildApp({
    getTeamById,
    findUserById,
    addMember,
  });

  await request(app)
    .post('/admin/definitions/teams/2/members/add')
    .type('form')
    .send({ user_id: '22222222-2222-4222-8222-222222222222' })
    .expect(302)
    .expect('Location', '/admin/definitions/teams/2/members?ok=' + encodeURIComponent('عضو به تیم اضافه شد.'));

  assert.equal(addMember.mock.calls.length, 1);
  assert.deepEqual(addMember.mock.calls[0].arguments, [2, '22222222-2222-4222-8222-222222222222']);
});

test('rejects invalid UUID when adding member', async () => {
  const getTeamById = mock.fn(async () => ({ id: 3, name: 'QA', is_active: true }));
  const findUserById = mock.fn(async () => null);
  const addMember = mock.fn(async () => ({}));

  const { app } = buildApp({
    getTeamById,
    findUserById,
    addMember,
  });

  await request(app)
    .post('/admin/definitions/teams/3/members/add')
    .type('form')
    .send({ user_id: 'not-a-uuid' })
    .expect(302)
    .expect(
      'Location',
      '/admin/definitions/teams/3/members?err=' + encodeURIComponent('شناسه کاربر باید به صورت UUID معتبر باشد.')
    );

  assert.equal(addMember.mock.calls.length, 0);
});

test('does not fetch candidate users without a search query', async () => {
  const getTeamById = mock.fn(async () => ({ id: 5, name: 'Data', org_node_id: 10 }));
  const listTeamMembers = mock.fn(async () => []);
  const listCandidateUsers = mock.fn(async () => {
    throw new Error('should not be called without query');
  });

  const { app } = buildApp({
    getTeamById,
    listTeamMembers,
    listCandidateUsers,
  });

  const res = await request(app).get('/admin/definitions/teams/5/members');
  assert.equal(res.status, 200);
  assert.equal(listCandidateUsers.mock.calls.length, 0);
});

test('limits candidate user search results to 50 items', async () => {
  const getTeamById = mock.fn(async () => ({ id: 9, name: 'Ops', org_node_id: 2 }));
  const listTeamMembers = mock.fn(async () => []);
  const listCandidateUsers = mock.fn(async (orgId, q, opts) => {
    assert.equal(opts.limit, 50);
    assert.equal(orgId, 2);
    assert.equal(q, 'ab');
    return Array.from({ length: 70 }).map((_, idx) => ({
      id: `u-${idx}`,
      username: `user${idx}`,
      first_name: 'User',
      last_name: String(idx),
      active: true,
    }));
  });

  const { app } = buildApp({
    getTeamById,
    listTeamMembers,
    listCandidateUsers,
  });

  const res = await request(app)
    .get('/admin/definitions/teams/9/members/candidates?q=ab')
    .expect('Content-Type', /json/);
  assert.equal(res.status, 200);
  assert.equal(listCandidateUsers.mock.calls.length, 1);
  assert.ok(Array.isArray(res.body.results));
  assert.equal(res.body.results.length, 50);
});

test('members candidates respond within acceptable time for large datasets', async () => {
  const getTeamById = mock.fn(async () => ({ id: 10, name: 'QA', org_node_id: 3 }));
  const listTeamMembers = mock.fn(async () => []);
  const bigList = Array.from({ length: 10000 }).map((_, idx) => ({
    id: `u-${idx}`,
    username: `user${idx}`,
    first_name: 'User',
    last_name: String(idx),
    active: true,
  }));
  const listCandidateUsers = mock.fn(async () => bigList);

  const { app } = buildApp({
    getTeamById,
    listTeamMembers,
    listCandidateUsers,
  });

  const started = performance.now();
  const res = await request(app)
    .get('/admin/definitions/teams/10/members/candidates?q=qa')
    .expect('Content-Type', /json/);
  const duration = performance.now() - started;
  assert.equal(res.status, 200);
  assert.ok(duration < 1200);
  assert.equal(res.body.results.length, 50);
});
