const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../config/db');
const {
  telegramGetMe,
  sendTelegramMessage,
  findAdminByUsername,
  logAdmin,
  bumpFailedAttempt,
  clearFailedAttempt,
  createOtpForAdmin,
  verifyOtp,
  validateStrongPassword,
} = require('../../services/systemAdmin.service');
const { ADMIN_FALLBACK_NAME, formatOtpIntro, normalizeOtpCode, throwIfTelegramErrors } = require('../../utils/telegramOtp');

const router = express.Router();

// Root admin route handler
router.get('/', (req, res) => {
  // Check if already authenticated as system admin
  const adminId = req.session && req.session.system_admin_id;
  
  if (adminId) {
    // System admin logged in → go to dashboard
    return res.redirect('/admin/dashboard');
  }
  
  // Check if authenticated as normal user
  const user = req.session && req.session.user;
  if (user) {
    // Normal user logged in → go to dashboard
    return res.redirect('/admin/dashboard');
  }
  
  // Not logged in → go to user login page
  // (System admin should use /admin/login directly)
  return res.redirect('/login');
});

function clientIp(req){
  return (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.socket?.remoteAddress || null;
}

function clearPending(req){
  if (!req.session) return;
  delete req.session.pending_admin_id;
  delete req.session.pending_admin_expires;
  delete req.session.pending_admin_started_at;
  delete req.session.pending_admin_name;
  delete req.session.is_first_setup;
  delete req.session.setup_data;
}

function pendingOk(req, ttlMinutes=10){
  const id = req.session.pending_admin_id;
  const started = req.session.pending_admin_started_at;
  if (!id || !started) return false;
  const ageMs = Date.now() - Number(started);
  return ageMs >= 0 && ageMs <= ttlMinutes * 60 * 1000;
}

async function sendAdminOtpMessages(token, chatId, adminName, code) {
  const introText = formatOtpIntro(adminName, ADMIN_FALLBACK_NAME);
  const messages = [
    { text: introText, step: 'intro' },
    { text: normalizeOtpCode(code), step: 'code' },
  ];

  const errors = [];
  for (const { text, step } of messages) {
    try {
      await sendTelegramMessage(token, chatId, text);
    } catch (e) {
      errors.push({ step, error: e });
    }
  }

  throwIfTelegramErrors(errors);
}

async function upsertTelegramBotToken(token){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings(
      key text PRIMARY KEY,
      value text NOT NULL
    );
  `);

  await pool.query(
    `INSERT INTO system_settings(key,value)
     VALUES ('telegram_bot_token',$1)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [token]
  );
}

router.get('/reset', (req, res) => {
  // اگر هرجایی گیر کرد، این مسیر سشن موقت را صفر می‌کند
  clearPending(req);
  delete req.session.system_admin_id;
  delete req.session.user;
  return res.redirect('/admin/login');
});

router.get('/login', async (req, res) => {
  // خیلی مهم: هر بار ورود را باز می‌کنیم state قبلی پاک شود
  clearPending(req);
  return res.render('auth/system_admin_login', { error: null });
});

router.post('/login', async (req, res) => {
  const username = (req.body.username || '').toString().trim();
  const password = (req.body.password || '').toString();
  const ip = clientIp(req);

  // اگر چیزی ناقص است، اجازه جلو رفتن نمی‌دهیم
  if (!username || !password) return res.render('auth/system_admin_login', { error: 'نام کاربری و رمز عبور الزامی است.' });

  try {
    const admin = await findAdminByUsername(username);
    if (!admin || !admin.is_active) {
      await logAdmin(null, 'login_failed_no_admin', { username }, ip);
      return res.render('auth/system_admin_login', { error: 'نام کاربری یا رمز عبور اشتباه است.' });
    }

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      await logAdmin(admin.id, 'login_blocked_locked', {}, ip);
      return res.render('auth/system_admin_login', { error: 'حساب ادمین قفل است. چند دقیقه بعد تلاش کنید.' });
    }

    const passOk = await bcrypt.compare(password, admin.password_hash);
    if (!passOk) {
      await bumpFailedAttempt(admin.id);
      await logAdmin(admin.id, 'login_failed_bad_password', {}, ip);
      return res.render('auth/system_admin_login', { error: 'نام کاربری یا رمز عبور اشتباه است.' });
    }

    await clearFailedAttempt(admin.id);

    // اینجا یعنی رمز درست بوده → پس اجازه داریم pending بسازیم
    const adminDisplayName = admin.username || ADMIN_FALLBACK_NAME;
    req.session.pending_admin_id = admin.id;
    req.session.pending_admin_started_at = Date.now();
    req.session.pending_admin_name = adminDisplayName;

    // اگر telegram_id یا bot token هنوز ست نشده → Setup اولیه
    const qTok = await pool.query(`SELECT value FROM system_settings WHERE key='telegram_bot_token' LIMIT 1`);
    const token = qTok.rows[0]?.value;

    if (!admin.telegram_id || !token) {
      req.session.is_first_setup = true;
      await logAdmin(admin.id, 'redirect_first_setup', { hasTelegram: !!admin.telegram_id, hasToken: !!token }, ip);
      return res.redirect('/admin/first-setup');
    }

    // روال عادی OTP
    const okMe = await telegramGetMe(token);
    if (!okMe) return res.render('auth/system_admin_login', { error: 'توکن ربات تلگرام نامعتبر است (getMe خطا).' });

    const { code, expiresAt } = await createOtpForAdmin(admin.id);
    await sendAdminOtpMessages(token, admin.telegram_id, adminDisplayName, code);

    req.session.pending_admin_expires = expiresAt.toISOString();
    await logAdmin(admin.id, 'otp_sent', { expiresAt }, ip);

    return res.redirect('/admin/verify');
  } catch (e) {
    console.error('POST /admin/login error:', e);
    return res.render('auth/system_admin_login', { error: 'خطای داخلی در ورود. دوباره تلاش کنید.' });
  }
});

router.get('/first-setup', (req, res) => {
  // اگر TTL گذشت یا pending معتبر نیست → برگرد به login
  if (!req.session.is_first_setup || !pendingOk(req)) {
    clearPending(req);
    return res.redirect('/admin/login');
  }
  return res.render('auth/system_admin_first_setup', { error: null });
});

router.post('/first-setup', async (req, res) => {
  if (!req.session.is_first_setup || !pendingOk(req)) {
    clearPending(req);
    return res.redirect('/admin/login');
  }

  const adminId = req.session.pending_admin_id;
  const ip = clientIp(req);

  const botToken = (req.body.bot_token || '').toString().trim();
  const telegramId = (req.body.telegram_id || '').toString().trim();
  const p1 = (req.body.password || '').toString();
  const p2 = (req.body.password2 || '').toString();

  if (!botToken) return res.render('auth/system_admin_first_setup', { error: 'توکن ربات تلگرام الزامی است.' });
  if (!/^\d+$/.test(telegramId)) return res.render('auth/system_admin_first_setup', { error: 'telegram_id باید عدد باشد.' });
  if (p1 !== p2) return res.render('auth/system_admin_first_setup', { error: 'تکرار رمز عبور با رمز عبور یکسان نیست.' });
  if (!validateStrongPassword(p1).ok) {
    return res.render('auth/system_admin_first_setup', { error: 'رمز باید حداقل ۸ کاراکتر و شامل حروف کوچک، بزرگ، عدد و علامت باشد.' });
  }

  try {
    const okMe = await telegramGetMe(botToken);
    if (!okMe) return res.render('auth/system_admin_first_setup', { error: 'توکن ربات تلگرام نامعتبر است (getMe خطا).' });

    const newHash = await bcrypt.hash(p1, 10);

    // OTP برای تایید telegram_id
    const { code, expiresAt } = await createOtpForAdmin(adminId);
    await sendAdminOtpMessages(botToken, telegramId, req.session.pending_admin_name || 'ادمین', code);

    req.session.setup_data = { botToken, telegramId, newHash };
    req.session.pending_admin_expires = expiresAt.toISOString();

    await logAdmin(adminId, 'first_setup_otp_sent', { expiresAt }, ip);
    return res.redirect('/admin/verify');
  } catch (e) {
    console.error('POST /admin/first-setup error:', e);
    return res.render('auth/system_admin_first_setup', { error: 'خطای داخلی در راه‌اندازی اولیه. دوباره تلاش کنید.' });
  }
});

router.get('/verify', (req, res) => {
  if (!pendingOk(req)) {
    clearPending(req);
    return res.redirect('/admin/login');
  }
  return res.render('auth/system_admin_verify', { error: null });
});

router.post('/verify', async (req, res) => {
  const code = (req.body.code || '').toString().trim();
  const ip = clientIp(req);

  if (!pendingOk(req)) {
    clearPending(req);
    return res.redirect('/admin/login');
  }

  const adminId = req.session.pending_admin_id;
  if (!code) return res.render('auth/system_admin_verify', { error: 'کد را وارد کنید.' });

  try {
    const r = await verifyOtp(adminId, code);
    if (!r.ok) {
      await logAdmin(adminId, 'otp_failed', { reason: r.reason }, ip);
      return res.render('auth/system_admin_verify', { error: 'کد نامعتبر است یا منقضی شده.' });
    }

    // اگر فلو Setup اولیه است → همینجا ذخیره نهایی
    if (req.session.setup_data) {
      const { botToken, telegramId, newHash } = req.session.setup_data;

      await upsertTelegramBotToken(botToken);

      await pool.query(
        `UPDATE system_admins
         SET telegram_id=$2, password_hash=$3, must_change_password=false, password_updated_at=now()
         WHERE id=$1`,
        [adminId, telegramId, newHash]
      );

      delete req.session.setup_data;
      delete req.session.is_first_setup;
    }

    req.session.system_admin_id = adminId;

    const q = await pool.query('SELECT id, username FROM system_admins WHERE id=$1', [adminId]);
    const admin = q.rows[0];
    req.session.user = { id: admin.id, username: admin.username, role: 'SYSTEM_ADMIN' };

    await pool.query('UPDATE system_admins SET last_login_at=now() WHERE id=$1', [adminId]);
    await logAdmin(adminId, 'login_success', {}, ip);

    // پاکسازی pending
    clearPending(req);

    return res.redirect('/admin/dashboard');
  } catch (e) {
    console.error('POST /admin/verify error:', e);
    return res.render('auth/system_admin_verify', { error: 'خطای داخلی. دوباره تلاش کنید.' });
  }
});

router.get('/logout', async (req, res) => {
  const adminId = req.session && req.session.system_admin_id;
  const isSystemAdmin = !!adminId;
  
  if (isSystemAdmin) {
    // System admin logout
    try { await logAdmin(adminId || null, 'logout', {}, clientIp(req)); } catch(e){}
    req.session.destroy(() => res.redirect('/admin/login'));
  } else {
    // Normal user logout - redirect to user login
    if (!req.session) return res.redirect('/login');
    req.session.destroy((err) => {
      if (err) console.error('logout destroy session error:', err);
      return res.redirect('/login');
    });
  }
});

module.exports = router;
