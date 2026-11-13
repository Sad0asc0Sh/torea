const assert = require('node:assert/strict');
const { test } = require('node:test');

test('POST /office-automation/ai/format validates topic_id', async () => {
  const mockPool = {
    query: async () => ({ rows: [] })
  };

  const mockAutomationAi = {
    processAutomationTranscript: async () => ({ formatted_text: 'test' })
  };

  // Mock express app
  let routeHandler;
  const mockRouter = {
    use: () => {},
    get: () => {},
    post: (path, handler) => {
      if (path === '/office-automation/ai/format') {
        routeHandler = handler;
      }
    }
  };

  const express = {
    Router: () => mockRouter
  };

  // Mock modules
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === 'express') return express;
    if (id === '../../../../../config/db') return mockPool;
    if (id === '../../../../../services/sttSettings.service') {
      return { fetchSttSettings: async () => ({ model_default: 'test' }) };
    }
    if (id === '../../../../../services/automationAi.service') {
      return mockAutomationAi;
    }
    if (id === '../../../../../middlewares/systemAdmin') {
      return { requireSystemAdmin: (req, res, next) => next() };
    }
    return originalRequire.apply(this, arguments);
  };

  delete require.cache[require.resolve('../../../../../src/routes/admin/tools/automation.routes')];
  require('../../../../../src/routes/admin/tools/automation.routes');

  assert.ok(routeHandler, 'Route handler should be registered');

  // Test invalid topic_id
  const req = {
    body: {
      topic_id: 'invalid',
      transcript_text: 'test text',
      item_type: 'request'
    }
  };

  let statusCode;
  let responseBody;
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
    }
  };

  await routeHandler(req, res);

  assert.equal(statusCode, 400);
  assert.equal(responseBody.ok, false);
  assert.equal(responseBody.error, 'INVALID_TOPIC_ID');

  Module.prototype.require = originalRequire;
});

test('POST /office-automation/ai/format validates transcript_text', async () => {
  const mockPool = {
    query: async () => ({ rows: [] })
  };

  const mockAutomationAi = {
    processAutomationTranscript: async () => ({ formatted_text: 'test' })
  };

  let routeHandler;
  const mockRouter = {
    use: () => {},
    get: () => {},
    post: (path, handler) => {
      if (path === '/office-automation/ai/format') {
        routeHandler = handler;
      }
    }
  };

  const express = {
    Router: () => mockRouter
  };

  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === 'express') return express;
    if (id === '../../../../../config/db') return mockPool;
    if (id === '../../../../../services/sttSettings.service') {
      return { fetchSttSettings: async () => ({ model_default: 'test' }) };
    }
    if (id === '../../../../../services/automationAi.service') {
      return mockAutomationAi;
    }
    if (id === '../../../../../middlewares/systemAdmin') {
      return { requireSystemAdmin: (req, res, next) => next() };
    }
    return originalRequire.apply(this, arguments);
  };

  delete require.cache[require.resolve('../../../../../src/routes/admin/tools/automation.routes')];
  require('../../../../../src/routes/admin/tools/automation.routes');

  const req = {
    body: {
      topic_id: 1,
      transcript_text: '',
      item_type: 'request'
    }
  };

  let statusCode;
  let responseBody;
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
    }
  };

  await routeHandler(req, res);

  assert.equal(statusCode, 400);
  assert.equal(responseBody.ok, false);
  assert.equal(responseBody.error, 'EMPTY_TRANSCRIPT');

  Module.prototype.require = originalRequire;
});

test('POST /office-automation/ai/format validates item_type', async () => {
  const mockPool = {
    query: async () => ({ rows: [] })
  };

  const mockAutomationAi = {
    processAutomationTranscript: async () => ({ formatted_text: 'test' })
  };

  let routeHandler;
  const mockRouter = {
    use: () => {},
    get: () => {},
    post: (path, handler) => {
      if (path === '/office-automation/ai/format') {
        routeHandler = handler;
      }
    }
  };

  const express = {
    Router: () => mockRouter
  };

  const Module = require('module');
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(id) {
    if (id === 'express') return express;
    if (id === '../../../../../config/db') return mockPool;
    if (id === '../../../../../services/sttSettings.service') {
      return { fetchSttSettings: async () => ({ model_default: 'test' }) };
    }
    if (id === '../../../../../services/automationAi.service') {
      return mockAutomationAi;
    }
    if (id === '../../../../../middlewares/systemAdmin') {
      return { requireSystemAdmin: (req, res, next) => next() };
    }
    return originalRequire.apply(this, arguments);
  };

  delete require.cache[require.resolve('../../../../../src/routes/admin/tools/automation.routes')];
  require('../../../../../src/routes/admin/tools/automation.routes');

  const req = {
    body: {
      topic_id: 1,
      transcript_text: 'test text',
      item_type: 'invalid_type'
    }
  };

  let statusCode;
  let responseBody;
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
    }
  };

  await routeHandler(req, res);

  assert.equal(statusCode, 400);
  assert.equal(responseBody.ok, false);
  assert.equal(responseBody.error, 'INVALID_ITEM_TYPE');

  Module.prototype.require = originalRequire;
});
