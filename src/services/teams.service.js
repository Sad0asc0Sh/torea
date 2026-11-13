const pool = require('../config/db');
// Strict UUID v1–v5 validator for user_id inputs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const BLOCKING_VALIDATION_CODES = new Set([
  'ERR_ALREADY_ASSIGNED_OTHER_TEAM',
  'ERR_IMPLICIT_SAME_TEAM',
  'ERR_IMPLICIT_OTHER_TEAM',
]);
const VALIDATION_BATCH_SIZE = 10;
const DEFAULT_STATEMENT_TIMEOUT_MS = 5000;
const MAX_STATEMENT_TIMEOUT_MS = 600000;
const sameTeamId = (a, b) => String(a) === String(b);

function normalizeQueryConfig(config) {
  if (typeof config === 'string') return { text: config, values: [] };
  const base = config || {};
  const values = Array.isArray(base.values) ? base.values : [];
  return { ...base, text: base.text || '', values };
}

function sanitizeStatementTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);
  const candidate = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_STATEMENT_TIMEOUT_MS;
  return Math.max(1, Math.min(MAX_STATEMENT_TIMEOUT_MS, candidate));
}

async function queryWithTimeout(config, timeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS, label = '') {
  const started = Date.now();
  const cfg = normalizeQueryConfig(config);
  const safeTimeout = sanitizeStatementTimeout(timeoutMs);
  const tag =
    label ||
    cfg.name ||
    (cfg.text ? cfg.text.replace(/\s+/g, ' ').trim().slice(0, 120) : 'query');
  const paramsForLog = Array.isArray(cfg.values)
    ? cfg.values.map((v) => {
        if (v === null || v === undefined) return v;
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.length > 120 ? s.slice(0, 120) + '…' : s;
      })
    : [];

  const logDuration = () => {
    const ms = Date.now() - started;
    console.log(`[sql] ${tag} ms=${ms}`);
    if (ms > 2000) {
      console.warn(`[sql-slow] ${tag} ms=${ms} params=${JSON.stringify(paramsForLog)}`);
    }
  };

  if (typeof pool.connect !== 'function') {
    try {
      const result = await pool.query(cfg);
      return result;
    } finally {
      logDuration();
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${safeTimeout}`);
    const result = await client.query(cfg);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    logDuration();
    client.release();
  }
}

function normalizeUserId(raw) {
  const s = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!s) return { value: null, error: 'شناسه کاربر نامعتبر است.' };
  if (!UUID_REGEX.test(s)) return { value: null, error: 'شناسه کاربر باید به صورت UUID معتبر باشد.' };
  return { value: s, error: null };
}

const DEFAULT_HIERARCHY_COLUMN = 'manager_id';
const DEFAULT_USERS_SCHEMA = 'public';
const DEFAULT_USERS_TABLE = 'users';

// Hierarchy column precedence: USER_HIERARCHY_COLUMN > HIERARCHY_COLUMN > TEAM_HIERARCHY_COLUMN
const HIERARCHY_ENV =
  (process.env.USER_HIERARCHY_COLUMN || process.env.HIERARCHY_COLUMN || process.env.TEAM_HIERARCHY_COLUMN || '').trim();

function toSafeIdentifier(name, fallback = DEFAULT_HIERARCHY_COLUMN) {
  const safeFallback = IDENTIFIER_REGEX.test(fallback || '') ? fallback : DEFAULT_HIERARCHY_COLUMN;
  return IDENTIFIER_REGEX.test(name || '') ? name : safeFallback;
}

function quoteIdentifier(name, fallback = DEFAULT_HIERARCHY_COLUMN) {
  const safe = toSafeIdentifier(name, fallback).replace(/"/g, '""');
  return `"${safe}"`;
}

const USERS_SCHEMA = toSafeIdentifier(process.env.USERS_SCHEMA || DEFAULT_USERS_SCHEMA, DEFAULT_USERS_SCHEMA);
const USERS_TABLE = toSafeIdentifier(process.env.USERS_TABLE || DEFAULT_USERS_TABLE, DEFAULT_USERS_TABLE);
const USERS_TABLE_IDENT = `${quoteIdentifier(USERS_SCHEMA, DEFAULT_USERS_SCHEMA)}.${quoteIdentifier(
  USERS_TABLE,
  DEFAULT_USERS_TABLE
)}`;

let hierarchyColumnCache = null;
async function getHierarchyColumn() {
  if (hierarchyColumnCache) return hierarchyColumnCache;
  if (HIERARCHY_ENV && IDENTIFIER_REGEX.test(HIERARCHY_ENV)) {
    hierarchyColumnCache = HIERARCHY_ENV;
    return hierarchyColumnCache;
  }
  try {
    const res = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND (data_type = 'uuid' OR udt_name = 'uuid')
      `,
      [USERS_SCHEMA, USERS_TABLE]
    );
    const names = (res.rows || []).map((r) => r.column_name).filter((n) => IDENTIFIER_REGEX.test(n));
    const preferred = ['manager_id', 'parent_id', 'supervisor_id', 'leader_id'];
    const found = preferred.find((n) => names.includes(n)) || names[0];
    hierarchyColumnCache = toSafeIdentifier(found || 'manager_id');
  } catch (err) {
    console.warn('[teams.service] hierarchy column detection failed, fallback to manager_id', err?.message || '');
    hierarchyColumnCache = DEFAULT_HIERARCHY_COLUMN;
  }
  return hierarchyColumnCache;
}

let orgNodeColumnCache = null;
async function hasOrgNodeColumn() {
  if (orgNodeColumnCache !== null) return orgNodeColumnCache;
  try {
    const res = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'org_node_id' LIMIT 1`
    );
    orgNodeColumnCache = res.rowCount > 0;
  } catch (err) {
    orgNodeColumnCache = false;
  }
  return orgNodeColumnCache;
}

async function listTeamsWithCounts() {
  const sql = `
    SELECT
      t.id,
      t.name,
      t.active,
      COUNT(DISTINCT uta.user_id)::int AS members_count,
      COUNT(DISTINCT tb.brand_id)::int AS brands_count
    FROM public.teams t
    LEFT JOIN public.user_team_assignment uta ON uta.team_id = t.id
    LEFT JOIN public.team_brands tb ON tb.team_id = t.id
    GROUP BY t.id
    ORDER BY t.id DESC
  `;
  const q = await pool.query(sql);
  return q.rows || [];
}

async function getTeamById(id, { statementTimeoutMs = 4000, debugLabel = 'getTeamById' } = {}) {
  const q = await queryWithTimeout(
    { text: 'SELECT * FROM public.teams WHERE id = $1', values: [id] },
    statementTimeoutMs,
    debugLabel
  );
  return q.rows[0] || null;
}

async function isNameTaken(name, excludeId = null) {
  const params = [name];
  let sql = 'SELECT id FROM public.teams WHERE LOWER(name) = LOWER($1)';
  if (excludeId) {
    sql += ' AND id <> $2';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';

  const q = await pool.query(sql, params);
  return !!(q.rows && q.rows.length);
}

async function createTeam({ name, active = true, orgNodeId = null }) {
  const activeValue = typeof active === 'boolean' ? active : !!active;
  const includeOrgNode = await hasOrgNodeColumn();
  const params = [name, activeValue];
  let sql = 'INSERT INTO public.teams (name, active) VALUES ($1, $2) RETURNING *';
  if (includeOrgNode) {
    sql = 'INSERT INTO public.teams (name, active, org_node_id) VALUES ($1, $2, $3) RETURNING *';
    params.push(orgNodeId || null);
  }
  const q = await pool.query(sql, params);
  return q.rows[0] || null;
}

async function updateTeam({ id, name, active, orgNodeId = null }) {
  const activeValue = typeof active === 'boolean' ? active : !!active;
  const includeOrgNode = await hasOrgNodeColumn();
  const params = [name, activeValue, id];
  let sql = 'UPDATE public.teams SET name=$1, active=$2, updated_at=NOW() WHERE id=$3 RETURNING *';
  if (includeOrgNode) {
    sql = 'UPDATE public.teams SET name=$1, active=$2, org_node_id=$3, updated_at=NOW() WHERE id=$4 RETURNING *';
    params.splice(2, 0, orgNodeId || null);
  }
  const q = await pool.query(sql, params);
  return q.rows[0] || null;
}

async function toggleTeamActive(id) {
  const q = await pool.query(
    'UPDATE public.teams SET active = NOT active, updated_at=NOW() WHERE id=$1 RETURNING *',
    [id]
  );
  return q.rows[0] || null;
}

async function listOrgNodes() {
  const q = await pool.query('SELECT id, title FROM public.org_nodes ORDER BY id');
  return q.rows || [];
}

async function listTeamMembers(
  teamId,
  { statementTimeoutMs = 8000, limit = 500, debugLabel = 'listTeamMembers' } = {}
) {
  const sql = `
    SELECT
      uta.team_id,
      uta.user_id,
      uta.created_at,
      uta.updated_at,
      COALESCE(u.username, '') as username,
      COALESCE(u.first_name, '') as first_name,
      COALESCE(u.last_name, '') as last_name,
      COALESCE(u.phone, '') as phone,
      COALESCE(u.status, '') as status,
      COALESCE(u.active, false) as active
    FROM public.user_team_assignment uta
    LEFT JOIN public.users u ON u.id = uta.user_id
    WHERE uta.team_id = $1
    ORDER BY uta.created_at DESC, uta.user_id
    LIMIT $2
  `;
  const q = await queryWithTimeout(
    { text: sql, values: [teamId, limit] },
    statementTimeoutMs,
    debugLabel
  );
  return q.rows || [];
}

async function searchActiveUsers(
  rawQuery,
  orgNodeId = null,
  { limit = 50, statementTimeoutMs = 4000, debugLabel = 'searchActiveUsers' } = {}
) {
  const q = (rawQuery || '').toString().trim();
  if (!q || q.length < 2) return [];

  const sanitized = q.replace(/%/g, '').replace(/_/g, '');
  const pattern = `%${sanitized}%`;
  const params = [pattern];
  const hasOrgScope = orgNodeId != null && Number.isFinite(Number(orgNodeId));
  const orgIdNum = hasOrgScope ? Number(orgNodeId) : null;
  const limitValue = Number.isFinite(limit) && limit > 0 ? Math.min(Number(limit), 50) : 50;

  let sql = `
    SELECT id, username, first_name, last_name, phone, status, active, org_node_id
    FROM public.users
    WHERE active = true
      AND (
        username ILIKE $1
        OR last_name ILIKE $1
        OR phone ILIKE $1
        OR first_name ILIKE $1
        OR CONCAT_WS(' ', first_name, last_name) ILIKE $1
      )
  `;

  if (hasOrgScope) {
    params.push(orgIdNum);
    sql += ' AND org_node_id = $2';
  }

  sql += `
    ORDER BY first_name, last_name, username
    LIMIT $${params.length + 1}
  `;

  params.push(limitValue);

  const res = await queryWithTimeout({ text: sql, values: params }, statementTimeoutMs, debugLabel);
  return res.rows || [];
}

async function findUserById(userId, { statementTimeoutMs = 4000, debugLabel = 'findUserById' } = {}) {
  const q = await queryWithTimeout(
    {
      text: 'SELECT id, username, first_name, last_name, phone, status, active FROM public.users WHERE id = $1',
      values: [userId],
    },
    statementTimeoutMs,
    debugLabel
  );
  return q.rows[0] || null;
}

async function getUserAssignmentTeam(userId, { statementTimeoutMs = 3000, debugLabel = 'getUserAssignmentTeam' } = {}) {
  const q = await queryWithTimeout(
    { text: 'SELECT team_id FROM public.user_team_assignment WHERE user_id = $1 LIMIT 1', values: [userId] },
    statementTimeoutMs,
    debugLabel
  );
  return q.rows[0] ? q.rows[0].team_id : null;
}

async function getHierarchyAssignments(
  userId,
  { includeSelf = true, statementTimeoutMs = 5000, debugLabel = 'getHierarchyAssignments' } = {}
) {
  const hierarchyColumn = quoteIdentifier(await getHierarchyColumn());
  const sql = `
    WITH RECURSIVE chain AS (
      SELECT u.id, u.${hierarchyColumn} AS parent_id
      FROM ${USERS_TABLE_IDENT} u
      WHERE u.id = $1
      UNION ALL
      SELECT p.id, p.${hierarchyColumn} AS parent_id
      FROM ${USERS_TABLE_IDENT} p
      JOIN chain c ON c.parent_id = p.id
      WHERE c.parent_id IS NOT NULL
    )
    SELECT a.user_id, a.team_id
    FROM chain
    JOIN public.user_team_assignment a ON a.user_id = chain.id
    ${includeSelf ? '' : 'WHERE chain.id <> $1'}
  `;
  const q = await queryWithTimeout({ text: sql, values: [userId] }, statementTimeoutMs, debugLabel);
  return q.rows || [];
}

async function getTeamAssignedAncestors(
  userId,
  { statementTimeoutMs = 5000, debugLabel = 'getTeamAssignedAncestors' } = {}
) {
  return getHierarchyAssignments(userId, { includeSelf: true, statementTimeoutMs, debugLabel });
}

async function getAncestorAssignments(
  userId,
  { statementTimeoutMs = 5000, debugLabel = 'getAncestorAssignments' } = {}
) {
  return getHierarchyAssignments(userId, { includeSelf: false, statementTimeoutMs, debugLabel });
}

async function getTeamAssignedDescendants(
  rootUserId,
  { statementTimeoutMs = 6000, debugLabel = 'getTeamAssignedDescendants' } = {}
) {
  const hierarchyColumn = quoteIdentifier(await getHierarchyColumn());
  const sql = `
    WITH RECURSIVE chain AS (
      SELECT u.id, u.${hierarchyColumn} AS parent_id, 1 AS depth
      FROM ${USERS_TABLE_IDENT} u
      WHERE u.id = $1
      UNION ALL
      SELECT ch.id, ch.${hierarchyColumn} AS parent_id, c.depth + 1 AS depth
      FROM ${USERS_TABLE_IDENT} ch
      JOIN chain c ON ch.${hierarchyColumn} = c.id
      WHERE c.depth < 50
    )
    SELECT a.user_id, a.team_id
    FROM chain
    JOIN public.user_team_assignment a ON a.user_id = chain.id
    WHERE chain.id <> $1
  `;
  const q = await queryWithTimeout({ text: sql, values: [rootUserId] }, statementTimeoutMs, debugLabel);
  return q.rows || [];
}

async function getUserDescendants(
  rootUserId,
  { includeSelf = false, statementTimeoutMs = 6000, debugLabel = 'getUserDescendants' } = {}
) {
  const hierarchyColumn = quoteIdentifier(await getHierarchyColumn());
  const sql = `
    WITH RECURSIVE chain AS (
      SELECT u.id, u.${hierarchyColumn} AS parent_id, 1 AS depth
      FROM ${USERS_TABLE_IDENT} u
      WHERE u.id = $1
      UNION ALL
      SELECT ch.id, ch.${hierarchyColumn} AS parent_id, c.depth + 1 AS depth
      FROM ${USERS_TABLE_IDENT} ch
      JOIN chain c ON ch.${hierarchyColumn} = c.id
      WHERE c.depth < 50
    )
    SELECT id
    FROM chain
    ${includeSelf ? '' : 'WHERE id <> $1'}
  `;
  const q = await queryWithTimeout({ text: sql, values: [rootUserId] }, statementTimeoutMs, debugLabel);
  return (q.rows || []).map((r) => r.id);
}

async function validateAddMember(
  teamId,
  userId,
  { statementTimeoutMs = 5000, allowOtherTeam = false, allowedAncestorIds = null } = {}
) {
  const directTeamId = await getUserAssignmentTeam(userId, {
    statementTimeoutMs,
    debugLabel: 'validateAddMember.getUserAssignmentTeam',
  });
  if (directTeamId !== null && directTeamId !== undefined) {
    if (!sameTeamId(directTeamId, teamId)) {
      if (!allowOtherTeam) {
        const err = new Error('User already assigned to another team');
        err.code = 'ERR_ALREADY_ASSIGNED_OTHER_TEAM';
        err.meta = { assignedTeamId: directTeamId, userId };
        throw err;
      }
      return { ok: true, reason: 'ASSIGNED_OTHER_TEAM', assignedTeamId: directTeamId };
    }
    return { ok: true, reason: 'ALREADY_IN_TEAM' };
  }

  const ancestors = await getAncestorAssignments(userId, {
    statementTimeoutMs,
    debugLabel: 'validateAddMember.getAncestorAssignments',
  });
  const allowedSet = allowedAncestorIds instanceof Set ? allowedAncestorIds : null;
  if (ancestors.length) {
    const blocking = ancestors.find((row) => !(allowedSet && allowedSet.has(row.user_id)));
    if (blocking) {
      const sameTeam = sameTeamId(blocking.team_id, teamId);
      const err = new Error(sameTeam ? 'Ancestor already in the same team' : 'Ancestor assigned to another team');
      err.code = sameTeam ? 'ERR_IMPLICIT_SAME_TEAM' : 'ERR_IMPLICIT_OTHER_TEAM';
      err.meta = {
        assignedTeamId: blocking.team_id,
        ancestorUserId: blocking.user_id,
        userId,
      };
      throw err;
    }
  }

  return { ok: true };
}

async function addMember(teamId, userId) {
  await validateAddMember(teamId, userId);
  const q = await pool.query(
    `INSERT INTO public.user_team_assignment (user_id, team_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET team_id = EXCLUDED.team_id
     RETURNING *`,
    [userId, teamId]
  );
  return q.rows[0] || null;
}

async function addMemberCascade(
  teamId,
  rootUserId,
  { allowReassign = false, statementTimeoutMs = 8000, debugLabel = 'addMemberCascade' } = {}
) {
  const descendants = await getUserDescendants(rootUserId, {
    includeSelf: false,
    statementTimeoutMs,
    debugLabel: `${debugLabel}.descendants`,
  });
  const allIds = Array.from(new Set([rootUserId, ...descendants]));
  const allowedAncestorIds = new Set(allIds);

  const assignmentsRes = await queryWithTimeout(
    {
      text: 'SELECT user_id, team_id FROM public.user_team_assignment WHERE user_id = ANY($1)',
      values: [allIds],
    },
    statementTimeoutMs,
    `${debugLabel}.assignments`
  );
  const assignmentMap = new Map((assignmentsRes.rows || []).map((r) => [r.user_id, r.team_id]));

  const toUpsert = [];
  let added = 0;
  let alreadyInTeam = 0;
  let skippedOtherTeam = 0;
  let skippedErrors = 0;
  let reassigned = 0;
  const skippedUserIds = [];

  for (const uid of allIds) {
    const assignedTeamId = assignmentMap.get(uid) ?? null;
    if (assignedTeamId && sameTeamId(assignedTeamId, teamId)) {
      alreadyInTeam += 1;
      continue;
    }
    if (assignedTeamId && !allowReassign) {
      skippedOtherTeam += 1;
      skippedUserIds.push(uid);
      continue;
    }
    try {
      await validateAddMember(teamId, uid, {
        statementTimeoutMs,
        allowOtherTeam: allowReassign,
        allowedAncestorIds,
      });
    } catch (err) {
      const code = err?.code;
      if (code && BLOCKING_VALIDATION_CODES.has(code)) {
        skippedErrors += 1;
        skippedUserIds.push(uid);
        continue;
      }
      throw err;
    }

    if (assignedTeamId && allowReassign) {
      reassigned += 1;
    } else {
      added += 1;
    }
    toUpsert.push(uid);
  }

  if (toUpsert.length) {
    await queryWithTimeout(
      {
        text: `
          INSERT INTO public.user_team_assignment (user_id, team_id)
          SELECT unnest($1::uuid[]), $2
          ON CONFLICT (user_id)
          DO UPDATE SET team_id = EXCLUDED.team_id
        `,
        values: [toUpsert, teamId],
      },
      statementTimeoutMs,
      `${debugLabel}.upsert`
    );
  }

  return {
    added,
    alreadyInTeam,
    skippedOtherTeam,
    skippedErrors,
    skippedUserIds,
    reassigned,
    attempted: allIds.length,
    processed: toUpsert.length,
  };
}

async function removeMember(teamId, userId) {
  await pool.query('DELETE FROM public.user_team_assignment WHERE user_id = $1 AND team_id = $2', [userId, teamId]);
}

async function countMembers(teamId) {
  const q = await pool.query('SELECT COUNT(*)::int AS c FROM public.user_team_assignment WHERE team_id = $1', [teamId]);
  return q.rows[0] ? q.rows[0].c : 0;
}

async function deleteTeam(id) {
  const q = await pool.query('DELETE FROM public.teams WHERE id = $1 RETURNING id', [id]);
  return q.rowCount || 0;
}


// ===== TEAM BRANDS (service) =====
async function listTeamBrands(teamId) {
  const sql = `
    SELECT
      tb.team_id,
      tb.brand_id,
      tb.priority,
      b.name AS brand_name,
      b.code AS brand_code,
      b.is_active
    FROM public.team_brands tb
    JOIN public.brands b ON b.id = tb.brand_id
    WHERE tb.team_id = $1
    ORDER BY COALESCE(tb.priority, 0) ASC, b.name ASC
  `;
  const q = await pool.query(sql, [teamId]);
  return q.rows || [];
}


async function addBrandToTeam(teamId, brandId, priority = 0) {
  const pr = Number.isFinite(Number(priority)) ? Number(priority) : 0;
  const sql = `
    INSERT INTO public.team_brands (team_id, brand_id, priority)
    VALUES ($1, $2, $3)
    ON CONFLICT (team_id, brand_id)
    DO UPDATE SET priority = EXCLUDED.priority
    RETURNING *
  `;
  const q = await pool.query(sql, [teamId, brandId, pr]);
  return q.rows[0] || null;
}


async function removeBrandFromTeam(teamId, brandId) {
  const sql = `DELETE FROM public.team_brands WHERE team_id = $1 AND brand_id = $2`;
  await pool.query(sql, [teamId, brandId]);
  return true;
}

// ===== END TEAM BRANDS =====



// ===== BRANDS (simple list for Team Brands UI) =====
async function listActiveBrandsSimple() {
  const sql = `
    SELECT
      id,
      name AS brand_name,
      code AS brand_code,
      is_active
    FROM public.brands
    WHERE is_active = true
    ORDER BY name ASC, id DESC
    LIMIT 500
  `;
  const q = await pool.query(sql);
  return q.rows || [];
}

// Search candidate users for team member picker; requires explicit query (>=2 chars)
async function listCandidateUsers(
  orgNodeId,
  rawQuery = '',
  { limit = 50, statementTimeoutMs = 4000, debugLabel = 'listCandidateUsers', teamIdForValidation = null } = {}
) {
  const users = await searchActiveUsers(rawQuery, orgNodeId, { limit, statementTimeoutMs, debugLabel });
  if (!teamIdForValidation) return users;

  const filtered = [];
  const userList = users || [];
  let unexpectedError = null;
  for (let i = 0; i < userList.length; i += VALIDATION_BATCH_SIZE) {
    const batch = userList.slice(i, i + VALIDATION_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((u) => validateAddMember(teamIdForValidation, u.id, { statementTimeoutMs }))
    );
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        filtered.push(batch[idx]);
        return;
      }
      const err = res.reason;
      if (err?.code && BLOCKING_VALIDATION_CODES.has(err.code)) return;
      console.warn('[listCandidateUsers] unexpected validation error', err);
      if (!unexpectedError) unexpectedError = err;
    });
  }
  if (unexpectedError) throw unexpectedError;
  return filtered;
}

module.exports = {
  queryWithTimeout,
  listTeamsWithCounts,
  getTeamById,
  isNameTaken,
  createTeam,
  updateTeam,
  toggleTeamActive,
  listOrgNodes,
  listTeamMembers,
  searchActiveUsers,
  listCandidateUsers,
  findUserById,
  getUserAssignmentTeam,
  getTeamAssignedAncestors,
  getAncestorAssignments,
  getTeamAssignedDescendants,
  getUserDescendants,
  validateAddMember,
  normalizeUserId,
  addMember,
  addMemberCascade,
  removeMember,
  countMembers,
  deleteTeam,
  listTeamBrands,
  addBrandToTeam,
  removeBrandFromTeam,
  listActiveBrandsSimple,
  addTeamBrand: addBrandToTeam,
  removeTeamBrand: removeBrandFromTeam,
};


// force export (post-exports safety)
try { module.exports.listActiveBrandsSimple = listActiveBrandsSimple; } catch (e) {}
