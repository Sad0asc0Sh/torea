const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const expressLayouts = require('express-ejs-layouts');
const { formatMoneyEn } = require('./utils/number');
const { createCatalogAccessMiddleware } = require('./middlewares/catalogAccess');
const { verifyLicenseOnBoot } = require('./services/license.service');
const { syncReportsToDatabase } = require('./services/reports.service');
const CONSTANTS = require('./config/constants');

const app = express();
app.set('trust proxy', 1);
const pool = require('./config/db');
app.locals.pool = pool;
app.locals.formatMoney = formatMoneyEn;
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'layouts/admin'); // unified layout
app.set('layout extractScripts', false);
app.set('layout extractStyles', false);

function isAuthLikePath(pathname) {
  const p = (pathname || '').toLowerCase();
  return (
    /^\/login\b/.test(p) ||
    /^\/register\b/.test(p) ||
    /^\/auth\b/.test(p) ||
    /^\/pending\b/.test(p) ||
    /^\/pre-register-info\b/.test(p)
  );
}

function isAdminAuthPath(pathname) {
  const p = (pathname || '').toLowerCase();
  return /^\/admin\/(login|verify|first-setup|reset|register)\b/.test(p);
}

function deriveActiveKeyFromPath(pathname) {
  const p = (pathname || '').toLowerCase();
  if (p.startsWith('/admin')) {
    if (/^\/admin\/definitions/.test(p)) return 'definitions';
    if (/^\/admin\/reports/.test(p)) return 'reports';
    if (/^\/admin\/tools/.test(p)) return 'tools';
    if (/^\/admin\/balance/.test(p)) return 'balance';
    if (/^\/admin\/approvals/.test(p)) return 'approvals';
    if (/^\/admin\/settings/.test(p)) return 'settings';
    if (/^\/admin\/customers/.test(p)) return 'tools';
    if (/^\/admin\/inbox/.test(p)) return 'approvals';
    if (/^\/admin\/dashboard/.test(p) || p === '/admin') return 'dashboard';
    return '';
  }
  return '';
}

// Prevent EJS ReferenceError in migrated admin views (legacy vars used in templates)
app.locals.__error = null;
app.locals.__warn  = null;
app.locals.__info  = null;
verifyLicenseOnBoot().catch((err) => {
  console.warn('License guard placeholder failed:', err?.message || err);
});

// Theme disabled: affects CSS loading only
const __themeDisabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.THEME_DISABLED || '').toLowerCase()
);

// Scripts disabled: separate control for JavaScript (rarely used)
const __scriptsDisabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.SCRIPTS_DISABLED || '').toLowerCase()
);

app.locals.themeDisabled = __themeDisabled;
app.locals.scriptsDisabled = __scriptsDisabled;

app.use((req, res, next) => {
  res.locals.themeDisabled = __themeDisabled;
  res.locals.scriptsDisabled = __scriptsDisabled;
  next();
});

// Centralized layout + shared locals
app.use((req, res, next) => {
  const pathname = req.path || '';
  const isAdminPath = pathname.startsWith('/admin');
  const authPage = isAuthLikePath(pathname) || isAdminAuthPath(pathname);

  if (authPage) {
    res.locals.layout = 'layouts/auth';
  } else {
    res.locals.layout = 'layouts/admin';
  }

  const derivedKey = deriveActiveKeyFromPath(pathname);
  res.locals.activeKey = typeof res.locals.activeKey === 'string' ? res.locals.activeKey : derivedKey;
  res.locals.extraCss = Array.isArray(res.locals.extraCss)
    ? res.locals.extraCss
    : (res.locals.extraCss ? [res.locals.extraCss] : []);
  res.locals.extraJs = Array.isArray(res.locals.extraJs)
    ? res.locals.extraJs
    : (res.locals.extraJs ? [res.locals.extraJs] : []);
  res.locals.pageTitle = res.locals.pageTitle || '';
  res.locals.headerTitle = res.locals.headerTitle || '';
  res.locals.pageClass = res.locals.pageClass || '';

  next();
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const __isProduction = process.env.NODE_ENV === 'production';
const __sessionSecretEnv = process.env.SESSION_SECRET;

if (__isProduction && !__sessionSecretEnv) {
  console.error('SESSION_SECRET environment variable is required in production.');
  process.exit(1);
}

if (!__isProduction && !__sessionSecretEnv) {
  console.warn('⚠️ Using fallback session secret because SESSION_SECRET is not set. Do not use this in production.');
}

const __sessionSecret = __sessionSecretEnv || 'secret';
const __useMemoryStore = process.env.SESSION_STORE === 'memory' || process.env.NODE_ENV === 'test';

// User session middleware - applies to ALL routes
const userSessionOptions = {
  store: __useMemoryStore
    ? new session.MemoryStore()
    : new PgSession({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: false,
      }),
  secret: __sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
    maxAge: CONSTANTS.SESSION_MAX_AGE_MS,
  },
};

const userSessionMiddleware = session(userSessionOptions);

// Apply user session middleware to ALL routes (including /admin)
// This allows normal users who log in via /login to access /admin UI pages
app.use(userSessionMiddleware);

// Reports sync only (catalog is now managed via UI)
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    const MAX_RETRIES = CONSTANTS.MAX_RETRIES;
    const RETRY_DELAY_MS = CONSTANTS.RETRY_DELAY_MS;
    let retryCount = 0;
    
    while (retryCount < MAX_RETRIES) {
      try {
        console.log(`[Reports] Syncing report definitions... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await syncReportsToDatabase();
        console.log('[Reports] ✅ Report definitions synced (widgets, queries, configs)');
        console.log('[Reports] ℹ️  Navigation items must be managed via /admin/settings/catalog-manager');
        break;
      } catch (err) {
        retryCount++;
        console.error(`[Reports] ❌ Sync failed (attempt ${retryCount}/${MAX_RETRIES}):`, err?.message || err);
        
        if (retryCount >= MAX_RETRIES) {
          console.error('[Reports] ⚠️  Failed after max retries.');
          console.error('[Reports] Stack trace:', err?.stack);
        } else {
          console.log(`[Reports] Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retryCount));
        }
      }
    }
  })().catch(err => {
    console.error('[Reports] Unhandled error in sync wrapper:', err);
  });
}
// ------------------ Helpers ------------------

const { getUser, requireLogin } = require('./middlewares/auth');
const { adminSession, ADMIN_COOKIE, requireSystemAdmin } = require('./middlewares/systemAdmin');
const enforceAuthFlow = require('./middlewares/enforceAuthFlow');

// ارسال کد به تلگرام

    
// ------------------ System Settings Helpers ------------------

async function getSetting(key) {
  try {
    const res = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    if (!res.rows.length) return null;
    return res.rows[0].value;
  } catch (err) {
    console.error('getSetting error:', err);
    return null;
  }
}

async function setSetting(key, value) {
  try {
    await pool.query(`
      INSERT INTO system_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
      `,
      [key, value]
    );
  } catch (err) {
    console.error('setSetting error:', err);
  }
}

async function isInitialSetup() {
  try {
    const res = await pool.query(
      "SELECT id, phone FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1"
    );
    if (!res.rows.length) return false;
    const admin = res.rows[0];
    return !admin.phone; // اگر phone تهی باشد یعنی هنوز پروفایل تکمیل نشده
  } catch (err) {
    console.error('isInitialSetup error:', err);
    return false;
  }
}

async function sendTelegramCode(chatIdOrUsername, code) {
  try {
    let token = await getSetting('telegram_bot_token');
if (!token || !chatIdOrUsername) return;

    const text = `کد احراز هویت شما در سامانه To infinity:\n${code}`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatIdOrUsername, text }),
    });
  } catch (err) {
    console.error('Telegram send error:', err.message || err);
  }
}

// گرفتن لیست سمت‌ها از جدول سلسله‌مراتب
// ---- ORG NODES (branch-aware) ----
function isSystemAdminUser() { return false; }
// ---- /ORG NODES ----





// گرفتن لیست ساده کاربران (برای کشویی مدیر تیم)
async function getAllUsersSimple() {
  try {
    const res = await pool.query(
      'SELECT id, CONCAT_WS(\' \', first_name, last_name) AS display_name, org_node_id FROM users WHERE (role NOT IN (\'SYSTEM\',\'SUPER_ADMIN\')) AND (LOWER(username) NOT IN (\'admin\',\'general_manager\')) ORDER BY display_name'
    );
    return res.rows || [];
  } catch (err) {
    console.error('getAllUsersSimple error:', err);
    return [];
  }
}

// بررسی اینکه manager_id واقعاً در لایه بالادست org_node_id است
// خروجی: { ok: true/false, value: managerIdOrNull }
async function normalizeManagerId(orgNodeId, managerId) {
  // ✅ SYSTEM branch: manager is not required
  try {
    const bq = await pool.query('SELECT branch FROM org_nodes WHERE id=$1', [orgNodeId]);
    const br = (bq.rows[0] && bq.rows[0].branch) ? String(bq.rows[0].branch).toUpperCase() : 'ORG';
    if (br === 'SYSTEM') return { ok: true, value: null };
  } catch (e) {
    // اگر کوئری branch مشکل داشت، ادامه بده با منطق قبلی
  }

  if (!orgNodeId) {
    // اگر سمت مشخص نشده، مدیر هم معتبر نیست
    return { ok: !managerId, value: null };
  }

  if (!managerId) {
    // مدیر انتخاب نشده → برای لایه‌های بالایی مجاز است
    return { ok: true, value: null };
  }

  try {
    // پیدا کردن والد این سمت
    const orgRes = await pool.query(
      'SELECT id, parent_id FROM org_nodes WHERE id = $1',
      [orgNodeId]
    );
    if (!orgRes.rows.length) {
      return { ok: false, value: null };
    }

    const node = orgRes.rows[0];
    const parentId = node.parent_id;

    if (!parentId) {
      // اگر سمت والد ندارد (مثلاً بالاترین لایه) مدیر نباید ست شود
      return { ok: false, value: null };
    }

    // چک کنیم آیا این مدیر، در همین لایه‌ی والد تعریف شده؟
    const mgrRes = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND org_node_id = $2',
      [managerId, parentId]
    );
    if (!mgrRes.rows.length) {
      return { ok: false, value: null };
    }

    return { ok: true, value: managerId };
  } catch (err) {
    console.error('normalizeManagerId error:', err);
    return { ok: false, value: null };
  }
}

// Admin session middleware - always activate for admin router
// This ensures all /admin/* routes use the admin session, not the user session
function alwaysUseAdminSession(req, res, next) {
  return adminSession(req, res, next);
}

// ------------------ Routes ------------------

function redirectWithStatus(status, targetBuilder) {
  return (req, res) => {
    const target = typeof targetBuilder === 'function' ? targetBuilder(req) : targetBuilder;
    const idx = (req.originalUrl || '').indexOf('?');
    const qs = idx >= 0 ? req.originalUrl.slice(idx) : '';
    return res.redirect(status, `${target}${qs}`);
  };
}

// Auth, Register, Telegram routes
const authRoutes = require('./routes/auth');
const registerRoutes = require('./routes/register');
const telegramAuthRoutes = require('./routes/telegram');

// Admin routes
const adminUsersRoutes = require('./routes/admin/users.routes');
const systemAdminRoutes = require('./routes/admin/system.routes');

// New admin router structure
const adminRoutes = require('./routes/admin/index.js');
const catalogAccessForAdmin = createCatalogAccessMiddleware({ preferAdminRoutes: true, enforce: true });

// ---- System Admin Auth Routes (separate session) - mount FIRST to take precedence ----
// These routes use adminSession for system admin authentication ONLY
const systemAdminRouter = express.Router();
systemAdminRouter.use(alwaysUseAdminSession);
systemAdminRouter.use(systemAdminRoutes);
app.use('/admin', systemAdminRouter);

// ---- General Admin UI Routes (unified session) ----
// These routes are accessible by ALL authenticated users (based on catalog permissions)
// They use the unified user session from /login, not the separate admin session
const adminUIRouter = express.Router();
adminUIRouter.use(requireLogin, enforceAuthFlow, catalogAccessForAdmin);
adminUIRouter.use(adminUsersRoutes);
adminUIRouter.use(adminRoutes);
app.use('/admin', adminUIRouter);

// Mount non-admin routes
app.use(authRoutes);
app.use(registerRoutes);
app.use(telegramAuthRoutes);

// User routes removed - now mounted under /admin

// Legacy root paths → redirect to /admin equivalents
app.get('/customers', redirectWithStatus(301, '/admin/customers'));
app.post('/customers', redirectWithStatus(307, '/admin/customers'));

app.get('/tools/credit-sale', redirectWithStatus(301, '/admin/tools/credit-sale'));
app.get('/tools/credit-sale/new', redirectWithStatus(301, '/admin/tools/credit-sale/new'));
app.get('/tools/credit-sale/my-open', redirectWithStatus(301, '/admin/tools/credit-sale/my-open'));
app.get('/tools/credit-sale/:id', redirectWithStatus(301, (req) => `/admin/tools/credit-sale/${req.params.id}`));
app.post('/tools/credit-sale', redirectWithStatus(307, '/admin/tools/credit-sale'));
app.post(
  '/tools/credit-sale/:id/approve',
  redirectWithStatus(307, (req) => `/admin/tools/credit-sale/${req.params.id}/approve`)
);

app.get('/tools/credit-settlement', redirectWithStatus(301, '/admin/tools/credit-settlement'));
app.get(
  '/tools/credit-settlement/new',
  redirectWithStatus(301, '/admin/tools/credit-settlement/new')
);
app.get(
  '/tools/credit-settlement/inbox',
  redirectWithStatus(301, '/admin/tools/credit-settlement/inbox')
);
app.post(
  '/tools/credit-settlement',
  redirectWithStatus(307, '/admin/tools/credit-settlement')
);
app.post(
  '/tools/credit-settlement/:id/decide',
  redirectWithStatus(307, (req) => `/admin/tools/credit-settlement/${req.params.id}/decide`)
);

app.get('/reports', redirectWithStatus(301, '/admin/reports'));
app.get('/reports/:reportKey', redirectWithStatus(301, (req) => `/admin/reports/${req.params.reportKey}`));
app.get(
  '/api/reports/:reportKey/data',
  redirectWithStatus(301, (req) => `/admin/api/reports/${req.params.reportKey}/data`)
);

// Legacy /user/* paths → redirect to /admin equivalents
app.use('/user', (req, res) => {
  const qsIndex = (req.originalUrl || '').indexOf('?');
  const qs = qsIndex >= 0 ? req.originalUrl.slice(qsIndex) : '';
  const status = req.method === 'GET' ? 301 : 307;
  const targetPath = req.path || '';
  return res.redirect(status, `/admin${targetPath}${qs}`);
});

// ---- Org Admin Mode (org_node-based) ----
app.use('/org-admin', (req, res) => {
  const qsIndex = (req.originalUrl || '').indexOf('?');
  const qs = qsIndex >= 0 ? req.originalUrl.slice(qsIndex) : '';
  const status = req.method === 'GET' ? 301 : 307;
  return res.redirect(status, `/admin${req.path || ''}${qs}`);
});

// Health check (installer/preflight)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

module.exports = app;
