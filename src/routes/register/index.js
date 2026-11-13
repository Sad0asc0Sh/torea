const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../config/db');
const { requireAuthFlow, blockIfLoggedIn, FLOW_STAGES } = require('../../middlewares/flowGuards');
const router = express.Router();


// ===== AUTO-ADDED: enforce first_name/last_name required =====
function validateFirstLastName(req, res, next) {
  const first = (req.body?.first_name ?? "").toString().trim();
  const last  = (req.body?.last_name  ?? "").toString().trim();

  if (!first || !last || first.length < 2 || last.length < 2) {
    try {
      if (typeof res.render === "function") {
        return res.status(400).render("register", { error: "نام و نام خانوادگی الزامی است و نباید خالی باشد." });
      }
    } catch (e) {}
    return res.status(400).json({ error: "first_name and last_name are required." });
  }

  req.body.first_name = first;
  req.body.last_name  = last;
  return next();
}
// ===== END AUTO-ADDED =====


function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  return next();
}


/* ---------------- helpers ---------------- */

async function getOrgNodes() {
  try {
    const r = await pool.query('SELECT id, title, parent_id, branch FROM org_nodes ORDER BY id ASC');
    return r.rows || [];
  } catch (e) {
    console.error('getOrgNodes error:', e);
    return [];
  }
}

async function getAllUsersSimple() {
  try {
    const r = await pool.query(`SELECT id, username, CONCAT_WS(\' \', first_name, last_name) AS display_name, org_node_id, role FROM users ORDER BY created_at ASC`);
    return r.rows || [];
  } catch (e) {
    console.error('getAllUsersSimple error:', e);
    return [];
  }
}

async function getUserById(id) {
  try {
    const r = await pool.query(
      'SELECT id, username, first_name, last_name, phone, telegram_id, role, active, status, org_node_id, manager_id FROM users WHERE id=$1',
      [id]
    );
    return r.rows[0] || null;
  } catch (e) {
    console.error('getUserById error:', e);
    return null;
  }
}

function genVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isAdminLike(req) {
  const role = String(req?.session?.user?.role || '').toUpperCase();
  return role.includes('ADMIN');
}

// همون الگوی رمز عبور بخش ادمین (حداقل ۸ کاراکتر + حرف + عدد + سمبل)
function isPasswordStrong(password) {
  const passRegex =
    /^(?=.*[A-Za-zآ-ی])(?=.*\d)(?=.*[!@#$%^&*()_+\-=${};':"\\|,.<>\/?]).{8,}$/;
  return passRegex.test(String(password || ''));
}

async function normalizeManagerId(orgNodeId, raw) {
  try {
    if (!raw) return { ok: true, value: null };

    const managerId = String(raw).trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(managerId)) return { ok: false, value: null };

    const oq = await pool.query('SELECT parent_id, branch FROM org_nodes WHERE id=$1', [orgNodeId]);
    if (!oq.rows.length) return { ok: false, value: null };

    const parentId = oq.rows[0].parent_id;
    const br = (oq.rows[0].branch ? String(oq.rows[0].branch).toUpperCase() : 'ORG');

    // در شاخه SYSTEM مدیر اجباری نیست
    if (br === 'SYSTEM') return { ok: true, value: null };

    // اگر والد ندارد، مدیر نباید ست شود
    if (!parentId) return { ok: false, value: null };

    const mq = await pool.query('SELECT id FROM users WHERE id=$1 AND org_node_id=$2', [managerId, parentId]);
    if (!mq.rows.length) return { ok: false, value: null };

    return { ok: true, value: managerId };
  } catch (e) {
    console.error('normalizeManagerId error:', e);
    return { ok: false, value: null };
  }
}

function isValidTelegramId(raw) {
  if (!raw) return true;
  const v = String(raw).trim();
  if (!v.length) return true;
  // optional leading @ + 5..32 letters/digits/underscore (Telegram rules)
  return /^@?[A-Za-z0-9_]{5,32}$/.test(v);
}

function renderRegister(res, data) {
  return res.render('auth/register', {
    error: null,
    editMode: false,
    hideOrgFields: false,
    form: { manager_id: null, telegram_id: '', accounting_code: '', status: 'pending_telegram', active: false, role: 'USER' },
    orgNodes: [],
    allUsers: [],
    ...data,
  });
}

/* ---------------- pre-register-info ----------------
   ✅ بعد از ثبت‌نام و قبل از احراز تلگرام
*/
router.get('/pre-register-info', (req, res) => {
  const adminParam = req.query.admin === '1';
  const isAdmin = adminParam && isAdminLike(req);
  if (adminParam && !isAdmin) return res.redirect('/login');
  if (!isAdmin) {
    const flow = req.session?.authFlow;
    if (!flow) return res.redirect('/login');
    if (flow.stage !== FLOW_STAGES.REGISTERED) return res.redirect('/login');
  }
  return res.render('auth/pre_register_info', {
    error: null,
    isAdmin,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
  });
});

router.post('/pre-register-info', (req, res) => {
  const adminParam = req.query.admin === '1';
  const isAdmin = adminParam && isAdminLike(req);
  if (adminParam && !isAdmin) return res.redirect('/login');
  if (!isAdmin) {
    const flow = req.session?.authFlow;
    if (!flow) return res.redirect('/login');
    if (flow.stage !== FLOW_STAGES.REGISTERED) return res.redirect('/login');
  }
  const { confirm_telegram_started } = (req.body || {});
  if (!confirm_telegram_started) {
    return res.render('auth/pre_register_info', {
      error: 'لطفاً تأیید کنید که ربات تلگرام را استارت کرده‌اید و آیدی خود را دارید.',
      isAdmin,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    });
  }

  if (isAdmin) return res.redirect('/register/edit');

  // برای مسیر عمومی
  const u = (req.session.authFlow?.username || req.session.pendingUsername || '').trim();
  req.session.authFlow = {
    ...(req.session.authFlow || {}),
    stage: FLOW_STAGES.PRE_REGISTER_OK,
    username: u,
    from: req.session?.authFlow?.from || 'register',
    userId: req.session?.authFlow?.userId || null,
  };
  return res.redirect('/auth/telegram');
});

/* ---------------- register (public) ---------------- */

router.get('/register', blockIfLoggedIn('/pending'), async (req, res) => {
  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  return renderRegister(res, {
    orgNodes,
    allUsers,
  });
});

router.post('/register', blockIfLoggedIn('/pending'), validateFirstLastName, async (req, res) => {
  try {
    const allowPublic = String(process.env.ALLOW_PUBLIC_REGISTER || 'true').toLowerCase() !== 'false';
    if (!allowPublic && !isAdminLike(req)) {
      return res.status(403).send('ثبت‌نام عمومی غیرفعال است.');
    }

    const b = (req.body || {});

    // فقط یک‌بار destructure (برای جلوگیری از already declared)
    const first_name = (b.first_name || '').trim();
    const last_name = (b.last_name || '').trim();
    const phone = (b.phone || '').trim();
    const telegram_id = (b.telegram_id || '').trim();
    const accounting_code = (b.accounting_code || '').trim();
    const username = (b.username || '').trim();
    const password = (b.password || '');
    const confirm_password = (b.confirm_password ?? b.password_confirm ?? b.password2 ?? b.confirm ?? b.retype_password ?? null);
    const orgNodeId = b.org_node_id ? parseInt(b.org_node_id, 10) : null;
    const managerIdRaw = (b.manager_id && String(b.manager_id).trim().length) ? String(b.manager_id).trim() : null;

    const orgNodes = await getOrgNodes();
    const allUsers = await getAllUsersSimple();

    const form = {
      first_name,
      last_name,
      phone,
      telegram_id,
      accounting_code,
      username,
      org_node_id: orgNodeId,
      manager_id: managerIdRaw,
      status: 'pending_telegram',
      active: false,
      role: 'USER',
    };

    if (!first_name || !last_name || !phone || !username || !password) {
      return renderRegister(res, { error: 'همه فیلدها الزامی است: نام، نام‌خانوادگی، شماره همراه، نام کاربری و رمز عبور.', form, orgNodes, allUsers });
    }

    if (!isValidTelegramId(telegram_id)) {
      return renderRegister(res, { error: 'آیدی تلگرام معتبر نیست. فقط حروف، عدد و خط زیر (۵ تا ۳۲ کاراکتر) مجاز است.', form, orgNodes, allUsers });
    }

    if (confirm_password !== null && confirm_password !== undefined && String(confirm_password) !== String(password)) {
      return renderRegister(res, { error: 'تکرار رمز عبور صحیح نیست.', form, orgNodes, allUsers });
    }

    if (!orgNodeId) {
      return renderRegister(res, { error: 'سمت سازمانی را انتخاب کنید.', form, orgNodes, allUsers });
    }

    if (accounting_code) {
      const dupAcc = await pool.query('SELECT 1 FROM users WHERE accounting_code = $1 LIMIT 1', [accounting_code]);
      if (dupAcc.rows.length) {
        return renderRegister(res, { error: 'کد حسابداری تکراری است.', form, orgNodes, allUsers });
      }
    }

    if (!isPasswordStrong(password)) {
      return renderRegister(res, { error: 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف، عدد و یک علامت خاص باشد.', form, orgNodes, allUsers });
    }

    const nm = await normalizeManagerId(orgNodeId, managerIdRaw);
    if (!nm.ok) {
      return renderRegister(res, { error: 'مدیر انتخاب‌شده معتبر نیست یا با لایه بالادست سمت شما همخوانی ندارد.', form, orgNodes, allUsers });
    }

    const exists = await pool.query('SELECT 1 FROM users WHERE username=$1 LIMIT 1', [username]);
    if (exists.rows.length) {
      return renderRegister(res, { error: 'این نام کاربری قبلاً ثبت شده است.', form, orgNodes, allUsers });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const verification_code = genVerificationCode();

    const ins = await pool.query(
      `INSERT INTO users
        (username, password_hash, first_name, last_name, accounting_code, phone, telegram_id, verification_code, role, org_node_id, manager_id, active, status)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,'USER',$9,$10,false,'pending_telegram')
       RETURNING id`,
      [username, hash, first_name, last_name, accounting_code || null, phone, telegram_id || null, verification_code, orgNodeId, nm.value]
    );

    req.session.pendingUserId = ins.rows[0]?.id || null;
    req.session.pendingUsername = username;
    req.session.authFlow = { stage: FLOW_STAGES.REGISTERED, username, from: 'register', userId: ins.rows[0]?.id || null };

    // ✅ طبق شرط شما: بعد از POST ثبت‌نام موفق -> 302 به /pre-register-info
    return res.redirect(302, '/pre-register-info');
  } catch (e) {
    console.error('POST /register error:', e);
    const orgNodes = await getOrgNodes();
    const allUsers = await getAllUsersSimple();
    return renderRegister(res, { error: 'خطا در ثبت‌نام. دوباره تلاش کنید.', orgNodes, allUsers });
  }
});

/* ---------------- register edit (admin) ---------------- */

router.get('/register/edit', requireLogin, async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.redirect('/login');

  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();
  const u = await getUserById(pendingId);
  if (!u) return res.redirect('/login');

  const form = {
    first_name: u.first_name || '',
    last_name: u.last_name || '',
    phone: u.phone || '',
    telegram_id: u.telegram_id || '',
    accounting_code: u.accounting_code || '',
    username: u.username || '',
    org_node_id: u.org_node_id || null,
    manager_id: u.manager_id || null,
  };

  return renderRegister(res, { editMode: true, form, orgNodes, allUsers, hideOrgFields: false });
});

router.post('/register/edit', validateFirstLastName, requireLogin, async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.redirect('/login');

  const b = (req.body || {});
  const first_name = (b.first_name || '').trim();
  const last_name = (b.last_name || '').trim();
  const phone = (b.phone || '').trim();
  const telegram_id = (b.telegram_id || '').trim() || null;
  const accounting_code = (b.accounting_code || '').trim();
  const username = (b.username || '').trim();
  const password = (b.password || '');
  const orgNodeId = b.org_node_id ? parseInt(b.org_node_id, 10) : null;
  const managerIdRaw = (b.manager_id && String(b.manager_id).trim().length) ? String(b.manager_id).trim() : null;

  const orgNodes = await getOrgNodes();
  const allUsers = await getAllUsersSimple();

  const form = { first_name, last_name, phone, telegram_id, username, org_node_id: orgNodeId, manager_id: managerIdRaw };
  form.accounting_code = accounting_code;

  if (!first_name || !last_name || !phone || !username || !orgNodeId) {
    return renderRegister(res, { error: 'نام، نام‌خانوادگی، شماره همراه، نام کاربری و سمت سازمانی الزامی است.', editMode: true, form, orgNodes, allUsers });
  }

  const nm = await normalizeManagerId(orgNodeId, managerIdRaw);
  if (!nm.ok) {
    return renderRegister(res, { error: 'مدیر انتخاب‌شده معتبر نیست یا با لایه بالادست سمت شما همخوانی ندارد.', editMode: true, form, orgNodes, allUsers });
  }

  try {
    if (accounting_code) {
      const dup = await pool.query('SELECT 1 FROM users WHERE accounting_code = $1 AND id <> $2 LIMIT 1', [accounting_code, pendingId]);
      if (dup.rows.length) {
        return renderRegister(res, { error: 'کد حسابداری تکراری است.', editMode: true, form, orgNodes, allUsers });
      }
    }

    if (password && String(password).length) {
      if (!isPasswordStrong(password)) {
        return renderRegister(res, { error: 'رمز عبور باید حداقل ۸ کاراکتر و شامل حرف، عدد و یک علامت خاص باشد.', editMode: true, form, orgNodes, allUsers });
      }
      const hash = await bcrypt.hash(String(password), 10);
      await pool.query(
        `UPDATE users
         SET username=$1, password_hash=$2, first_name=$3, last_name=$4, accounting_code=$5, phone=$6, telegram_id=$7, org_node_id=$8, manager_id=$9
           WHERE id=$10`,
        [username, hash, first_name, last_name, accounting_code || null, phone, telegram_id, orgNodeId, nm.value, pendingId]
      );
    } else {
      await pool.query(
        `UPDATE users
         SET username=$1, first_name=$2, last_name=$3, accounting_code=$4, phone=$5, telegram_id=$6, org_node_id=$7, manager_id=$8
           WHERE id=$9`,
        [username, first_name, last_name, accounting_code || null, phone, telegram_id, orgNodeId, nm.value, pendingId]
      );
    }

    req.session.authFlow = { stage: FLOW_STAGES.NEED_TG_2FA, username: req.session?.user?.username || username };
    return res.redirect('/auth/telegram');
  } catch (e) {
    console.error('POST /register/edit error:', e);
    return renderRegister(res, { error: 'خطا در ذخیره اطلاعات.', editMode: true, form, orgNodes, allUsers });
  }
});

module.exports = router;
