const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');

function loadServiceWithDb(mockDb) {
  const dbPath = require.resolve('../../../src/config/db');
  require.cache[dbPath] = { exports: mockDb };
  delete require.cache[require.resolve('../../../src/services/teams.service')];
  return require('../../../src/services/teams.service');
}

test('searchActiveUsers matches multiple fields and org scope', async () => {
  const users = [
    { id: 'u1', username: 'k1', first_name: 'Ali', last_name: 'خدیوی', phone: '02123456', status: 'active', active: true, org_node_id: 10 },
    { id: 'u2', username: 'mahmud', first_name: 'Mahmud', last_name: 'Jones', phone: '021', status: 'active', active: true, org_node_id: 10 },
    { id: 'u3', username: 'sara', first_name: 'Sara', last_name: 'Nine', phone: '09120000000', status: 'active', active: true, org_node_id: 10 },
    { id: 'u4', username: 'other', first_name: 'Mahmud', last_name: 'Else', phone: '09120000001', status: 'active', active: true, org_node_id: 99 },
  ];

  const query = mock.fn(async (sql, params = []) => {
    const text = typeof sql === 'string' ? sql : sql.text || '';
    const args = Array.isArray(params) && params.length ? params : sql.values || [];
    const condensed = text.replace(/\s+/g, ' ').toLowerCase();
    assert.ok(condensed.includes('username ilike $1'));
    assert.ok(condensed.includes('last_name ilike $1'));
    assert.ok(condensed.includes('phone ilike $1'));
    assert.ok(condensed.includes('first_name ilike $1'));
    assert.ok(condensed.includes("concat_ws(' ', first_name, last_name) ilike $1"));
    assert.ok(condensed.includes('active = true'));
    assert.ok(condensed.includes('limit $'));
    if (args.length > 2) {
      assert.ok(condensed.includes('org_node_id = $2'));
    }

    const pattern = (args[0] || '').toString().replace(/%/g, '').toLowerCase();
    const orgFilter = args.length > 2 ? args[1] : null;
    assert.equal(args[args.length - 1], 50);
    const filtered = users.filter((u) => {
      if (orgFilter != null && Number(u.org_node_id) !== Number(orgFilter)) return false;
      const fields = [u.username, u.first_name, u.last_name, u.phone].map((v) => (v || '').toString().toLowerCase());
      return fields.some((f) => f.includes(pattern));
    });
    return { rows: filtered.slice(0, 20) };
  });

  const teamsService = loadServiceWithDb({ query });

  const persian = await teamsService.searchActiveUsers('خدیوی', 10);
  assert.deepEqual(persian.map((u) => u.id), ['u1']);

  const firstName = await teamsService.searchActiveUsers('Mahmud', 10);
  assert.deepEqual(firstName.map((u) => u.id), ['u2']);

  const phone = await teamsService.searchActiveUsers('09', 10);
  assert.deepEqual(phone.map((u) => u.id), ['u3']);

  const scoped = await teamsService.searchActiveUsers('Mahmud', 99);
  assert.deepEqual(scoped.map((u) => u.id), ['u4']);

  assert.equal(query.mock.calls.length, 4);
});

test('listActiveBrandsSimple returns aliased brand fields', async () => {
  const rows = [
    { id: 1, brand_name: 'Alpha', brand_code: 'A1', is_active: true },
    { id: 2, brand_name: 'Beta', brand_code: null, is_active: true },
  ];

  const query = mock.fn(async (sql) => {
    const condensed = sql.replace(/\s+/g, ' ').toLowerCase();
    assert.ok(condensed.includes('name as brand_name'));
    assert.ok(condensed.includes('code as brand_code'));
    assert.ok(condensed.includes('where is_active = true'));
    return { rows };
  });

  const teamsService = loadServiceWithDb({ query });

  const result = await teamsService.listActiveBrandsSimple();
  assert.equal(query.mock.calls.length, 1);
  assert.deepEqual(result, rows);
});

test('queryWithTimeout sets literal timeout and uses config object', async () => {
  const client = {
    query: mock.fn(async () => ({ rows: [{ ok: true }] })),
    release: mock.fn(),
  };
  const pool = { connect: mock.fn(async () => client) };
  const { queryWithTimeout } = loadServiceWithDb(pool);

  const res = await queryWithTimeout({ text: 'SELECT 1', values: [] }, 1234);
  assert.ok(res);
  assert.equal(pool.connect.mock.calls.length, 1);
  assert.equal(client.query.mock.calls[0].arguments[0], 'BEGIN');
  assert.equal(client.query.mock.calls[1].arguments[0], 'SET LOCAL statement_timeout = 1234');
  assert.deepEqual(client.query.mock.calls[2].arguments[0], { text: 'SELECT 1', values: [] });
  assert.equal(client.query.mock.calls[3].arguments[0], 'COMMIT');
});

test('queryWithTimeout forwards parameterized queries', async () => {
  const client = {
    query: mock.fn(async (cfg) => {
      if (typeof cfg === 'string') return {};
      return { rows: [{ n: cfg.values[0] }] };
    }),
    release: mock.fn(),
  };
  const pool = { connect: mock.fn(async () => client) };
  const { queryWithTimeout } = loadServiceWithDb(pool);

  const res = await queryWithTimeout({ text: 'SELECT $1::int AS n', values: [1] }, 2000);
  assert.equal(res.rows[0].n, 1);
  const cfgCall = client.query.mock.calls.find((c) => typeof c.arguments[0] === 'object');
  assert.deepEqual(cfgCall.arguments[0], { text: 'SELECT $1::int AS n', values: [1] });
});

test('repository does not contain parameterized statement_timeout', async () => {
  const root = path.resolve(__dirname, '..', '..');
  const banned = 'SET LOCAL statement_timeout = $1';
  const seedPaths = ['src', 'migrations', 'scripts', '.github'].map((p) => path.join(root, p));
  const stack = [];

  for (const seed of seedPaths) {
    try {
      const stat = await fs.stat(seed);
      if (stat.isDirectory()) {
        stack.push(seed);
      } else if (stat.isFile()) {
        const content = await fs.readFile(seed, 'utf8');
        if (content.includes(banned)) {
          assert.fail(`Found banned pattern in ${path.relative(root, seed)}`);
        }
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (path.resolve(fullPath) === path.resolve(__filename)) continue; // skip this test file to avoid matching the guard pattern here
      const content = await fs.readFile(fullPath, 'utf8');
      if (content.includes(banned)) {
        assert.fail(`Found banned pattern in ${path.relative(root, fullPath)}`);
      }
    }
  }
});
