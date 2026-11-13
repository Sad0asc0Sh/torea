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

const {
  createCatalogAccessMiddleware,
  __setCatalogEffectiveAccessor,
  __resetCatalogEffectiveAccessor,
} = require('../../../src/middlewares/catalogAccess');

test('SYSTEM_ADMIN bypass keeps stored mode but allows all known routes', async () => {
  const stubEffective = {
    mode: 'USER',
    routes: { admin: ['/admin/page'], user: ['/user/page'] },
    allowedRoutes: ['/admin/page'],
    menu: [],
    menuAll: [{ key: 'admin.page', label: 'Page', href: '/admin/page' }],
    flat: [],
  };

  __setCatalogEffectiveAccessor(async () => stubEffective);
  try {
    const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

    const req = {
      session: { user: { role: 'SYSTEM_ADMIN', org_node_id: 42 } },
      baseUrl: '/admin',
      path: '/page',
    };
    const res = {
      locals: {},
      status(code) {
        this.statusCode = code;
        return {
          render: () => {
            this.rendered = true;
          },
        };
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, undefined);
    assert.equal(req.orgCatalogMode, 'ADMIN');
    assert.equal(req.orgAdminMode, true);
    assert.deepEqual(res.locals.__catalogKnownRoutes, []);
    assert.deepEqual(res.locals.__catalogAllowedRoutes, []);
    assert.ok(res.locals.__catalogBypass);
    assert.ok(Array.isArray(res.locals.__menuFiltered));
    assert.equal(nextCalled, true);
  } finally {
    __resetCatalogEffectiveAccessor();
  }
});

test('returns 403 when route is catalog-managed but not allowed', async () => {
  const stubEffective = {
    mode: 'USER',
    routes: { admin: ['/admin/secure'], user: [] },
    allowedRoutes: [],
    menu: [],
    menuAll: [],
    flat: [],
  };

  __setCatalogEffectiveAccessor(async () => stubEffective);
  try {
    const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

    const req = {
      session: { user: { role: 'USER', org_node_id: 1 } },
      baseUrl: '/admin',
      path: '/secure',
    };
    const res = {
      locals: {},
      statusCode: null,
      renderedView: null,
      renderedData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      render(view, data) {
        this.renderedView = view;
        this.renderedData = data;
        return this;
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.renderedView, 'user/unauthorized');
    assert.ok(res.renderedData);
    assert.equal(res.renderedData.user.role, 'USER');
  } finally {
    __resetCatalogEffectiveAccessor();
  }
});

// 🔒 Security Fix #1: Users without org_node_id should be denied
test('SECURITY: User without org_node_id is denied access', async () => {
  const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

  const req = {
    session: { user: { id: 'user-123', username: 'test1', role: 'USER', org_node_id: null } },
    baseUrl: '/admin',
    path: '/dashboard',
  };
  const res = {
    locals: {},
    statusCode: null,
    renderedView: null,
    renderedData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.renderedView = view;
      this.renderedData = data;
      return this;
    },
  };

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, 'next() should not be called');
  assert.equal(res.statusCode, 403, 'should return 403 Forbidden');
  assert.equal(res.renderedView, 'user/unauthorized', 'should render unauthorized view');
});

test('SECURITY: User without org_node_id but with undefined is denied', async () => {
  const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

  const req = {
    session: { user: { id: 'user-456', username: 'test2', role: 'USER', org_node_id: undefined } },
    baseUrl: '/admin',
    path: '/settings',
  };
  const res = {
    locals: {},
    statusCode: null,
    renderedView: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.renderedView = view;
      this.renderedData = data;
      return this;
    },
  };

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, 'next() should not be called');
  assert.equal(res.statusCode, 403, 'should return 403 Forbidden');
});

// 🔒 Security Fix #2: org_node mode='ADMIN' should NOT grant bypass
test('SECURITY: org_node with mode=ADMIN does not bypass access control', async () => {
  const stubEffective = {
    mode: 'ADMIN', // org_node has mode='ADMIN'
    routes: { admin: ['/admin/secure', '/admin/dashboard'], user: [] },
    allowedRoutes: ['/admin/dashboard'], // Only dashboard is allowed
    menu: [],
    menuAll: [],
    flat: [{ href: '/admin/dashboard' }],
  };

  __setCatalogEffectiveAccessor(async () => stubEffective);
  try {
    const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

    const req = {
      session: { user: { id: 'user-789', username: 'test3', role: 'USER', org_node_id: 5 } },
      baseUrl: '/admin',
      path: '/secure', // User tries to access /admin/secure (not in allowedRoutes)
    };
    const res = {
      locals: {},
      statusCode: null,
      renderedView: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      render(view, data) {
        this.renderedView = view;
        this.renderedData = data;
        return this;
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'next() should not be called - access should be denied');
    assert.equal(res.statusCode, 403, 'should return 403 Forbidden even with org_node mode=ADMIN');
  } finally {
    __resetCatalogEffectiveAccessor();
  }
});

// 🔒 Security Fix #3: Unknown routes should be denied by default
test('SECURITY: Unknown route is denied by default', async () => {
  const stubEffective = {
    mode: 'USER',
    routes: { admin: ['/admin/dashboard', '/admin/settings'], user: [] },
    allowedRoutes: ['/admin/dashboard'],
    menu: [],
    menuAll: [],
    flat: [{ href: '/admin/dashboard' }],
  };

  __setCatalogEffectiveAccessor(async () => stubEffective);
  try {
    const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

    const req = {
      session: { user: { id: 'user-101', username: 'test4', role: 'USER', org_node_id: 5 } },
      baseUrl: '/admin',
      path: '/secret-hidden-page', // Unknown route not in catalog
    };
    const res = {
      locals: {},
      statusCode: null,
      renderedView: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      render(view, data) {
        this.renderedView = view;
        this.renderedData = data;
        return this;
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'next() should not be called - unknown routes should be denied');
    assert.equal(res.statusCode, 403, 'should return 403 Forbidden for unknown routes');
  } finally {
    __resetCatalogEffectiveAccessor();
  }
});

test('SECURITY: User with proper access can access allowed route', async () => {
  const stubEffective = {
    mode: 'USER',
    routes: { admin: ['/admin/dashboard'], user: [] },
    allowedRoutes: ['/admin/dashboard'],
    menu: [],
    menuAll: [],
    flat: [{ href: '/admin/dashboard' }],
  };

  __setCatalogEffectiveAccessor(async () => stubEffective);
  try {
    const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

    const req = {
      session: { user: { id: 'user-202', username: 'test5', role: 'USER', org_node_id: 5 } },
      baseUrl: '/admin',
      path: '/dashboard',
    };
    const res = {
      locals: {},
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      render(view, data) {
        this.renderedView = view;
        this.renderedData = data;
        return this;
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, 'next() should be called for properly allowed routes');
    assert.equal(res.statusCode, null, 'should not set error status for allowed routes');
  } finally {
    __resetCatalogEffectiveAccessor();
  }
});

test('SECURITY: Error in catalog fetch results in 403', async () => {
  __setCatalogEffectiveAccessor(async () => {
    throw new Error('Database error');
  });
  
  try {
    const middleware = createCatalogAccessMiddleware({ enforce: true, preferAdminRoutes: true });

    const req = {
      session: { user: { id: 'user-303', username: 'test6', role: 'USER', org_node_id: 5 } },
      baseUrl: '/admin',
      path: '/dashboard',
    };
    const res = {
      locals: {},
      statusCode: null,
      renderedView: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      render(view, data) {
        this.renderedView = view;
        this.renderedData = data;
        return this;
      },
    };

    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'next() should not be called on error');
    assert.equal(res.statusCode, 403, 'should return 403 Forbidden on error');
  } finally {
    __resetCatalogEffectiveAccessor();
  }
});
