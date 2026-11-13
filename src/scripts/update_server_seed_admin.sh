#!/usr/bin/env bash
set -e

cd /opt/bria-app

# backup
BACKUP="server.js.bak_$(date +%Y%m%d_%H%M%S)"
cp server.js "$BACKUP"
echo "Backup created: $BACKUP"

# write new server.js
cat << 'JS' > server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.locals.pool = pool;
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
  })
);

// ------------------ Helpers ------------------

function getUser(req) {
  return req.session.user || null;
}

function requireAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/login');
  if (u.role !== 'ADMIN') return res.status(403).send('Forbidden');
  next();
}

// ارسال کد به تلگرام
async function sendTelegramCode(chatIdOrUsername, code) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
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
async function getOrgNodes() {
  try {
    const res = await pool.query(
      'SELECT id, title, parent_id, COALESCE(level,1) AS level FROM org_nodes ORDER BY COALESCE(level,1), id'
    );
    return res.rows || [];
  } catch (err) {
    console.error('getOrgNodes error:', err);
    return [];
  }
}

// گرفتن لیست ساده کاربران (برای کشویی مدیر تیم)
async function getAllUsersSimple() {
  try {
    const res = await pool.query(
      "SELECT id, CONCAT_WS(' ', first_name, last_name) AS full_name, org_node_id FROM users ORDER BY 2"
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

// ------------------ ادمین اولیه ------------------

// ایجاد خودکار ادمین اولیه در اولین اجرای سیستم
async function ensureInitialAdminUser() {
  try {
    const cRes = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    const count = cRes.rows[0]?.c || 0;
    if (count > 0) {
      // حداقل یک کاربر وجود دارد، نیازی به ساخت ادمین پیش‌فرض نیست
      return;
    }

    // پیدا کردن سمت "شرکت" اگر وجود دارد، وگرنه اولین نود سلسله‌مراتب
    let orgNodeId = null;
    try {
      const qCompany = await pool.query(
        "SELECT id FROM org_nodes WHERE title = $1 ORDER BY COALESCE(level,1), id LIMIT 1",
        ['شرکت']
      );
      if (qCompany.rows.length) {
        orgNodeId = qCompany.rows[0].id;
      } else {
        const qAny = await pool.query(
          'SELECT id FROM org_nodes ORDER BY COALESCE(level,1), id LIMIT 1'
        );
        if (qAny.rows.length) {
          orgNodeId = qAny.rows[0].id;
        }
      }
    } catch (e) {
      console.error('ensureInitialAdminUser org_nodes error:', e);
    }

    const hash = await bcrypt.hash('admin-1234', 10);

  await pool.query(
    `
    INSERT INTO users
      (first_name, last_name, accounting_code, phone, telegram_id, username, password_hash,
       verification_code, status, role, active, org_node_id, manager_id)
    VALUES
      ($1,        $2,    $3,           $4,    $5,         $6,       $7,
       NULL,           'seed_admin', 'ADMIN', true, $8, NULL)
    `,
    ['ادمین', 'سیستم', null, null, null, 'admin', hash, orgNodeId]
  );

    console.log('Initial admin user created: username "admin", password "admin-1234".');
  } catch (err) {
    console.error('ensureInitialAdminUser error:', err);
  }
}

// آیا هنوز ادمین اولیه (seed_admin) وجود دارد؟
async function shouldShowFirstAdminHint() {
  try {
    const q = await pool.query(
      "SELECT 1 FROM users WHERE status = 'seed_admin' LIMIT 1"
    );
    return q.rows.length > 0;
  } catch (err) {
    console.error('shouldShowFirstAdminHint error:', err);
    return false;
  }
}

// ------------------ Routes ------------------

app.get('/', (req, res) => res.redirect('/login'));

// فرم لاگین
app.get('/login', async (req, res) => {
  let firstAdminHint = false;
  try {
    await ensureInitialAdminUser();
    firstAdminHint = await shouldShowFirstAdminHint();
  } catch (err) {
    console.error('GET /login hint error:', err);
  }

  res.render('login', { error: null, firstAdminHint });
});

// پردازش لاگین
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const firstAdminHint = await shouldShowFirstAdminHint();

  if (!username || !password) {
    return res.render('login', {
      error: 'نام کاربری و رمز را وارد کنید.',
      firstAdminHint,
    });
  }

  try {
    await ensureInitialAdminUser();

    const q = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!q.rows.length) {
      return res.render('login', {
        error: 'نام کاربری یا رمز عبور اشتباه است.',
        firstAdminHint,
      });
    }

    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render('login', {
        error: 'نام کاربری یا رمز عبور اشتباه است.',
        firstAdminHint,
      });
    }

    // اگر ادمین اولیه است → مستقیم به /register/edit (بدون وریفای تلگرام)
    if (user.status === 'seed_admin') {
      req.session.pendingUserId = user.id;
      return res.redirect('/register/edit');
    }

    // اگر هنوز فعال نشده
    if (!user.active) {
      // اگر در انتظار تأیید مدیر است
      if (user.status === 'pending_manager') {
        return res.render('login', {
          error: 'حساب کاربری شما در انتظار تأیید مدیر بالاسری است.',
          firstAdminHint,
        });
      }
      // در غیر این صورت (مثلاً هنوز احراز تلگرام کامل نشده) می‌فرستیم به ادیت ثبت‌نام
      req.session.pendingUserId = user.id;
      return res.redirect('/register/edit');
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('login error:', err);
    return res.render('login', {
      error: 'خطای داخلی سیستم.',
      firstAdminHint,
    });
  }
});

// ------------------ ثبت‌نام کاربر جدید ------------------

app.get('/register', async (req, res) => {
  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  res.render('register', {
    error: null,
    editMode: false,
    form: { manager_id: null },
    orgNodes,
    allUsers,
  });
});

app.post('/register', async (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    telegram_id,
    username,
    password,
    org_node_id,
    manager_id,
  } = req.body;

  const orgNodeId = org_node_id ? parseInt(org_node_id, 10) : null;
  const managerIdRaw =
    manager_id && manager_id.toString().trim().length ? manager_id.toString().trim() : null;

  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  const form = {
    first_name,
    last_name,
    phone,
    telegram_id,
    username,
    org_node_id: orgNodeId,
    manager_id: managerIdRaw,
  };

  if (!first_name || !last_name || !phone || !username || !password) {
    return res.render('register', {
      error: 'نام، شماره همراه، نام کاربری و رمز عبور الزامی است.',
      editMode: false,
      form,
      orgNodes,
      allUsers,
    });
  }

  if (!orgNodeId) {
    return res.render('register', {
      error: 'سمت سازمانی را انتخاب کنید.',
      editMode: false,
      form,
      orgNodes,
      allUsers,
    });
  }

  const passRegex =
    /^(?=.*[A-Za-zآ-ی])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

  if (!passRegex.test(password)) {
    return res.render('register', {
      error: 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف، عدد و یک علامت خاص باشد.',
      editMode: false,
      form,
      orgNodes,
      allUsers,
    });
  }

  // اعتبارسنجی مدیر بالادست
  const mgrCheck = await normalizeManagerId(orgNodeId, managerIdRaw);
  if (!mgrCheck.ok) {
    return res.render('register', {
      error: 'مدیر انتخاب‌شده با لایه بالادست سمت شما همخوانی ندارد.',
      editMode: false,
      form,
      orgNodes,
      allUsers,
    });
  }
  const managerIdToSave = mgrCheck.value;

  try {
    // چک تکراری نبودن نام کاربری
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length) {
      return res.render('register', {
        error: 'این نام کاربری قبلاً استفاده شده است.',
        editMode: false,
        form,
        orgNodes,
        allUsers,
      });
    }

    // از این به بعد همیشه یوزر جدید USER است (ادمین اولیه از قبل ساخته می‌شود)
    const role = 'USER';

    const hash = await bcrypt.hash(password, 10);
    const code = String(Math.floor(100000 + Math.random() * 900000));

  const ins = await pool.query(
    `
    INSERT INTO users
      (first_name, last_name, accounting_code, phone, telegram_id, username, password_hash,
       verification_code, status, role, active, org_node_id, manager_id)
    VALUES
      ($1,        $2,    $3,           $4,    $5,         $6,       $7,
       $8,               'pending_verification', $9, false, $10, $11)
    RETURNING id, username, telegram_id
    `,
    [
      first_name,
      last_name,
      null,
      phone,
      telegram_id || null,
      username,
      hash,
      code,
      role,
      orgNodeId,
      managerIdToSave,
    ]
  );

    const newUser = ins.rows[0];
    req.session.pendingUserId = newUser.id;

    if (telegram_id) {
      await sendTelegramCode(telegram_id, code);
    }

    return res.redirect('/auth/telegram?username=' + encodeURIComponent(username));
  } catch (err) {
    console.error('register error:', err);
    return res.render('register', {
      error: 'خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.',
      editMode: false,
      form,
      orgNodes,
      allUsers,
    });
  }
});

// ------------------ ادیت ثبت‌نام برای کاربر نیمه‌کاره ------------------

app.get('/register/edit', async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.redirect('/login');

  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  try {
    const q = await pool.query('SELECT * FROM users WHERE id = $1', [pendingId]);
    if (!q.rows.length) return res.redirect('/login');

    const u = q.rows[0];
    const first_name = u.first_name || '';
    const last_name = u.last_name || '';

    const form = {
      first_name,
      last_name,
      phone: u.phone || '',
      telegram_id: u.telegram_id || '',
      username: u.username || '',
      org_node_id: u.org_node_id || null,
      manager_id: u.manager_id || null,
    };

    return res.render('register', {
      error: null,
      editMode: true,
      form,
      orgNodes,
      allUsers,
    });
  } catch (err) {
    console.error('GET /register/edit error:', err);
    return res.redirect('/login');
  }
});

app.post('/register/edit', async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.redirect('/login');

  const {
    first_name,
    last_name,
    phone,
    telegram_id,
    username,
    password,
    org_node_id,
    manager_id,
  } = req.body;

  const orgNodeId = org_node_id ? parseInt(org_node_id, 10) : null;
  const managerIdRaw =
    manager_id && manager_id.toString().trim().length ? manager_id.toString().trim() : null;

  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  const form = {
    first_name,
    last_name,
    phone,
    telegram_id,
    username,
    org_node_id: orgNodeId,
    manager_id: managerIdRaw,
  };

  if (!first_name || !last_name || !phone || !username) {
    return res.render('register', {
      error: 'نام، شماره همراه و نام کاربری الزامی است.',
      editMode: true,
      form,
      orgNodes,
      allUsers,
    });
  }

  if (!orgNodeId) {
    return res.render('register', {
      error: 'سمت سازمانی را انتخاب کنید.',
      editMode: true,
      form,
      orgNodes,
      allUsers,
    });
  }

  try {
    // کاربر فعلی را بخوانیم تا بفهمیم seed_admin هست یا نه
    const qExisting = await pool.query('SELECT * FROM users WHERE id = $1', [pendingId]);
    if (!qExisting.rows.length) {
      return res.redirect('/login');
    }
    const existing = qExisting.rows[0];
    const isSeedAdmin = existing.status === 'seed_admin';

    // چک تکراری نبودن نام کاربری
    const qUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND id <> $2',
      [username, pendingId]
    );
    if (qUser.rows.length) {
      return res.render('register', {
        error: 'این نام کاربری قبلاً برای کاربر دیگری استفاده شده است.',
        editMode: true,
        form,
        orgNodes,
        allUsers,
      });
    }

    // اعتبارسنجی مدیر
    const mgrCheck = await normalizeManagerId(orgNodeId, managerIdRaw);
    if (!mgrCheck.ok) {
      return res.render('register', {
        error: 'مدیر انتخاب‌شده با لایه بالادست سمت شما همخوانی ندارد.',
        editMode: true,
        form,
        orgNodes,
        allUsers,
      });
    }
    const managerIdToSave = mgrCheck.value;

    let params = [
      first_name,
      last_name,
      phone,
      telegram_id || null,
      username,
      orgNodeId,
      managerIdToSave,
      pendingId,
    ];
    let passSql = '';

    if (password && password.length > 0) {
      const passRegex =
        /^(?=.*[A-Za-zآ-ی])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
      if (!passRegex.test(password)) {
        return res.render('register', {
          error: 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف، عدد و یک علامت خاص باشد.',
          editMode: true,
          form,
          orgNodes,
          allUsers,
        });
      }
      const hash = await bcrypt.hash(password, 10);
      passSql = ', password_hash = $9';
      params.push(hash);
    }

    await pool.query(
      `
      UPDATE users
         SET first_name  = $1,
             last_name   = $2,
             phone       = $3,
             telegram_id = $4,
             username    = $5,
             org_node_id = $6,
             manager_id  = $7
             ${passSql}
       WHERE id = $8
      `,
      params
    );

    // اگر ادمین اولیه بود → بدون وریفای تلگرام فعالش کن و مستقیم بفرست داشبورد
    if (isSeedAdmin) {
      await pool.query(
        "UPDATE users SET status = 'active', active = true WHERE id = $1",
        [pendingId]
      );

      req.session.pendingUserId = null;
      req.session.user = {
        id: existing.id,
        username,
        role: existing.role || 'ADMIN',
      };
      return res.redirect('/admin/dashboard');
    }

    // بقیه کاربران → ادامه احراز تلگرام
    return res.redirect('/auth/telegram?username=' + encodeURIComponent(username));
  } catch (err) {
    console.error('POST /register/edit error:', err);
    return res.render('register', {
      error: 'خطا در ذخیره اطلاعات. لطفاً دوباره تلاش کنید.',
      editMode: true,
      form,
      orgNodes,
      allUsers,
    });
  }
});

// ------------------ احراز تلگرام ------------------

app.get('/auth/telegram', (req, res) => {
  const username = req.query.username || '';
  res.render('telegram_auth', {
    error: null,
    info: null,
    username,
    telegram_id: '',
  });
});

app.post('/auth/telegram/send-code', async (req, res) => {
  const { username, telegram_id } = req.body;
  let error = null;
  let info = null;

  if (!username || !telegram_id) {
    error = 'نام کاربری و آیدی تلگرام اجباری است.';
    return res.render('telegram_auth', { error, info, username, telegram_id });
  }

  try {
    const q = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!q.rows.length) {
      error = 'کاربری با این نام کاربری پیدا نشد.';
      return res.render('telegram_auth', { error, info, username, telegram_id });
    }

    const user = q.rows[0];
    const code = String(Math.floor(100000 + Math.random() * 900000));

    await pool.query(
      `
      UPDATE users
         SET telegram_id       = $1,
             verification_code = $2,
             active            = false,
             status            = 'pending_verification'
       WHERE id = $3
      `,
      [telegram_id, code, user.id]
    );

    try {
      await sendTelegramCode(telegram_id, code);
      info =
        'کد احراز هویت به تلگرام شما ارسال شد. تلگرام را چک کنید و کد را در فرم پایین وارد نمایید.';
    } catch (e) {
      console.error('sendTelegramCode error:', e);
      error = 'کد در سیستم ثبت شد، اما ارسال تلگرام با خطا مواجه شد.';
    }

    return res.render('telegram_auth', { error, info, username, telegram_id });
  } catch (err) {
    console.error('send-code error:', err);
    error = 'خطا در ارسال کد. دوباره تلاش کنید.';
    return res.render('telegram_auth', { error, info, username, telegram_id });
  }
});

app.post('/auth/telegram/verify-code', async (req, res) => {
  const { username, code } = req.body;
  let error = null;
  let info = null;

  if (!username || !code) {
    error = 'نام کاربری و کد احراز را وارد کنید.';
    return res.render('telegram_auth', { error, info, username, telegram_id: '' });
  }

  try {
    const q = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!q.rows.length) {
      error = 'کاربری با این نام پیدا نشد.';
      return res.render('telegram_auth', { error, info, username, telegram_id: '' });
    }

    const user = q.rows[0];

    if (!user.verification_code || user.verification_code !== code) {
      error = 'کد وارد شده صحیح نیست.';
      return res.render('telegram_auth', {
        error,
        info,
        username,
        telegram_id: user.telegram_id || '',
      });
    }

    // اینجا به جای فعال کردن مستقیم کاربر، می‌بریمش در وضعیت pending_manager
    await pool.query(
      `
      UPDATE users
         SET verification_code = NULL,
             active            = false,
             status            = 'pending_manager'
       WHERE id = $1
      `,
      [user.id]
    );

    info =
      'کد با موفقیت تایید شد. حساب شما ثبت شد و اکنون در انتظار تأیید مدیر بالاسری است.';
    return res.render('telegram_auth', {
      error,
      info,
      username,
      telegram_id: user.telegram_id || '',
    });
  } catch (err) {
    console.error('verify-code error:', err);
    error = 'خطای داخلی در تایید کد.';
    return res.render('telegram_auth', { error, info, username, telegram_id: '' });
  }
});

// ------------------ خروج ------------------

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ------------------ روت‌های اصلی ادمین ------------------

const adminRoutes = require('./routes/admin');
app.use('/admin', requireAdmin, adminRoutes);

// ------------------ مدیریت کاربران (ادمین) ------------------

// لیست همه کاربران (همراه سمت و مدیر)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
         u.phone,
         u.username,
         u.role,
         u.active,
         u.status,
         u.org_node_id,
         u.manager_id,
         o.title     AS org_title,
         CONCAT_WS(' ', m.first_name, m.last_name) AS manager_name
       FROM users u
       LEFT JOIN org_nodes o ON o.id = u.org_node_id
       LEFT JOIN users     m ON m.id = u.manager_id
       ORDER BY u.id DESC`
    );
    res.render('admin_users', { users: q.rows, error: null, message: null });
  } catch (err) {
    console.error('GET /admin/users error:', err);
    res.render('admin_users', {
      users: [],
      error: 'خطا در خواندن لیست کاربران.',
      message: null,
    });
  }
});

// حذف کاربر (با قفل برای ادمین و کاربر در حال ورود)
app.post('/admin/users/:id/delete', requireAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    const qUser = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (!qUser.rows.length) {
      return res.redirect('/admin/users');
    }

    const u = qUser.rows[0];

    // جلوگیری از حذف مدیر سیستم
    if (u.role === 'ADMIN') {
      const qAll = await pool.query(
        `SELECT
           u.id,
           u.first_name,
           u.last_name,
           CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
           u.phone,
           u.username,
           u.role,
           u.active,
           u.status,
           u.org_node_id,
           u.manager_id,
           o.title     AS org_title,
           CONCAT_WS(' ', m.first_name, m.last_name) AS manager_name
         FROM users u
         LEFT JOIN org_nodes o ON o.id = u.org_node_id
         LEFT JOIN users     m ON m.id = u.manager_id
         ORDER BY u.id DESC`
      );
      return res.render('admin_users', {
        users: qAll.rows,
        error: 'حذف کاربر با نقش مدیر سیستم مجاز نیست.',
        message: null,
      });
    }

    // جلوگیری از حذف کاربر در حال ورود (احتیاط)
    const currentUser = getUser(req);
    if (currentUser && currentUser.id === u.id) {
      const qAll = await pool.query(
        `SELECT
           u.id,
           u.first_name,
           u.last_name,
           CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
           u.phone,
           u.username,
           u.role,
           u.active,
           u.status,
           u.org_node_id,
           u.manager_id,
           o.title     AS org_title,
           CONCAT_WS(' ', m.first_name, m.last_name) AS manager_name
         FROM users u
         LEFT JOIN org_nodes o ON o.id = u.org_node_id
         LEFT JOIN users     m ON m.id = u.manager_id
         ORDER BY u.id DESC`
      );
      return res.render('admin_users', {
        users: qAll.rows,
        error: 'نمی‌توانید حساب کاربری در حال ورود را حذف کنید.',
        message: null,
      });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('POST /admin/users/:id/delete error:', err);
    return res.redirect('/admin/users');
  }
});

// فرم ویرایش کاربر
app.get('/admin/users/:id/edit', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const q = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!q.rows.length) {
      return res.redirect('/admin/users');
    }
    const user = q.rows[0];
    const orgNodes = await getOrgNodes();
    const allUsers = await getAllUsersSimple();
    res.render('admin_user_edit', { user, error: null, orgNodes, allUsers });
  } catch (err) {
    console.error('GET /admin/users/:id/edit error:', err);
    res.redirect('/admin/users');
  }
});

// ذخیره ویرایش کاربر
app.post('/admin/users/:id/edit', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const {
    first_name,
    last_name,
    phone,
    telegram_id,
    username,
    role,
    active,
    password,
    org_node_id,
    manager_id,
  } = req.body;

  const orgNodeId = org_node_id ? parseInt(org_node_id, 10) : null;
  const managerIdRaw =
    manager_id && manager_id.toString().trim().length ? manager_id.toString().trim() : null;

  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  if (!first_name || !last_name || !phone || !username) {
    return res.render('admin_user_edit', {
      user: {
        id,
        first_name,
        last_name,
        phone,
        telegram_id,
        username,
        role,
        active: active === 'on' || active === 'true' || active === '1',
        org_node_id: orgNodeId,
        manager_id: managerIdRaw,
      },
      error: 'نام، شماره همراه و نام کاربری الزامی است.',
      orgNodes,
      allUsers,
    });
  }

  if (!orgNodeId) {
    return res.render('admin_user_edit', {
      user: {
        id,
        first_name,
        last_name,
        phone,
        telegram_id,
        username,
        role,
        active: active === 'on' || active === 'true' || active === '1',
        org_node_id: orgNodeId,
        manager_id: managerIdRaw,
      },
      error: 'سمت سازمانی را انتخاب کنید.',
      orgNodes,
      allUsers,
    });
  }

  // اعتبارسنجی مدیر
  const mgrCheck = await normalizeManagerId(orgNodeId, managerIdRaw);
  if (!mgrCheck.ok) {
    return res.render('admin_user_edit', {
      user: {
        id,
        first_name,
        last_name,
        phone,
        telegram_id,
        username,
        role,
        active: active === 'on' || active === 'true' || active === '1',
        org_node_id: orgNodeId,
        manager_id: managerIdRaw,
      },
      error: 'مدیر انتخاب‌شده با لایه بالادست سمت این کاربر همخوانی ندارد.',
      orgNodes,
      allUsers,
    });
  }
  const managerIdToSave = mgrCheck.value;

  const activeBool = active === 'on' || active === 'true' || active === '1';

  try {
    if (password && password.length > 0) {
      const passRegex =
        /^(?=.*[A-Za-zآ-ی])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
      if (!passRegex.test(password)) {
        return res.render('admin_user_edit', {
          user: {
            id,
            first_name,
            last_name,
            phone,
            telegram_id,
            username,
            role,
            active: activeBool,
            org_node_id: orgNodeId,
            manager_id: managerIdRaw,
          },
          error: 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف، عدد و یک علامت خاص باشد.',
          orgNodes,
          allUsers,
        });
      }
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET first_name=$1, last_name=$2, phone=$3, telegram_id=$4, username=$5, role=$6, active=$7, password_hash=$8, org_node_id=$9, manager_id=$10 WHERE id=$11',
        [
          first_name,
          last_name,
          phone,
          telegram_id || null,
          username,
          role,
          activeBool,
          hash,
          orgNodeId,
          managerIdToSave,
          id,
        ]
      );
    } else {
      await pool.query(
        'UPDATE users SET first_name=$1, last_name=$2, phone=$3, telegram_id=$4, username=$5, role=$6, active=$7, org_node_id=$8, manager_id=$9 WHERE id=$10',
        [
          first_name,
          last_name,
          phone,
          telegram_id || null,
          username,
          role,
          activeBool,
          orgNodeId,
          managerIdToSave,
          id,
        ]
      );
    }

    res.redirect('/admin/users');
  } catch (err) {
    console.error('POST /admin/users/:id/edit error:', err);
    try {
      const q = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      const user = q.rows[0] || null;
      res.render('admin_user_edit', {
        user,
        error: 'خطا در ذخیره اطلاعات کاربر.',
        orgNodes,
        allUsers,
      });
    } catch (e2) {
      res.redirect('/admin/users');
    }
  }
});

// ------------------ Start Server ------------------

const PORT = process.env.APP_PORT || process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Running on port', PORT);
});
JS

echo "server.js updated."
