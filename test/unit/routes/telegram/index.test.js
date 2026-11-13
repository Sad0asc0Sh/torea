const path = require('node:path');
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

function buildApp(mockUser) {
  const fetchMock = async () => ({ json: async () => ({ ok: true }) });
  require.cache[require.resolve('node-fetch')] = { exports: fetchMock };

  const telegramAuthService = require('../../services/telegramAuth.service');
  const authService = require('../../services/auth.service');

  const getUserByUsernameMock = mock.fn(async () => ({ ...mockUser }));
  const setTelegramAndCodePendingMock = mock.fn(async () => {});
  const setVerificationCodeOnlyMock = mock.fn(async () => {});
  const verifyCodeAndActivateMock = mock.fn(async () => ({ ok: true }));

  telegramAuthService.getUserByUsername = getUserByUsernameMock;
  telegramAuthService.setTelegramAndCodePending = setTelegramAndCodePendingMock;
  telegramAuthService.setVerificationCodeOnly = setVerificationCodeOnlyMock;
  telegramAuthService.verifyCodeAndActivate = verifyCodeAndActivateMock;

  authService.getSystemSetting = async () => 'dummy-token';

  delete require.cache[require.resolve('./index')];
  const telegramRouter = require('./index');

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    if (!req.session.user) {
      req.session.user = { username: mockUser.username };
    }
    next();
  });
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../views'));
  app.use(telegramRouter);

  return {
    app,
    mocks: {
      getUserByUsernameMock,
      setTelegramAndCodePendingMock,
      setVerificationCodeOnlyMock,
      verifyCodeAndActivateMock,
    },
  };
}

test('GET /auth/telegram shows Step1 with prefilled telegram_id for pending_verification', async () => {
  const mockUser = {
    id: 1,
    username: 'pendinguser',
    telegram_id: '@fromdb',
    status: 'pending_verification',
    first_name: 'Pending',
  };
  const { app } = buildApp(mockUser);

  const res = await request(app).get('/auth/telegram');

  assert.equal(res.status, 200);
  assert.match(res.text, /name="telegram_id"/);
  assert.match(res.text, /@fromdb/);
  assert.match(res.text, /ارسال کد احراز به تلگرام/);
});

test('GET /auth/telegram hides Step1 when user is active', async () => {
  const mockUser = {
    id: 2,
    username: 'activeuser',
    telegram_id: '@locked',
    status: 'active',
    first_name: 'Active',
  };
  const { app } = buildApp(mockUser);

  const res = await request(app).get('/auth/telegram');

  assert.equal(res.status, 200);
  assert.ok(!res.text.includes('name="telegram_id"'));
  assert.match(res.text, /کد فقط به تلگرام ثبتشده شما ارسال میشود./);
});

test('POST /auth/telegram/send-code blocks forged telegram_id once locked', async () => {
  const mockUser = {
    id: 3,
    username: 'lockeduser',
    telegram_id: '@locked',
    status: 'active',
    first_name: 'Locked',
  };
  const { app, mocks } = buildApp(mockUser);

  const res = await request(app)
    .post('/auth/telegram/send-code')
    .type('form')
    .send({ telegram_id: '@attacker' });

  assert.equal(res.status, 403);
  assert.equal(mocks.setTelegramAndCodePendingMock.mock.calls.length, 0);
  assert.equal(mocks.setVerificationCodeOnlyMock.mock.calls.length, 0);
});
