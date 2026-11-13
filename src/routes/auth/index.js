const express = require('express');
const bcrypt = require('bcryptjs');
const authService = require('../../services/auth.service');
const { blockIfLoggedIn, FLOW_STAGES } = require('../../middlewares/flowGuards');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/login'));

async function isInitialSetup() {
  try {
    const telegramToken = await authService.getSystemSetting('telegram_bot_token');
    return !telegramToken;
  } catch {
    return false;
  }
}

router.get('/login', blockIfLoggedIn('/pending'), async (req, res) => {
  const initialSetup = await isInitialSetup();
  let showAdminHint = false;

  try {
    const count = await authService.countUsers();
    showAdminHint = count <= 1;
  } catch (err) {
    console.error('login showAdminHint error:', err);
  }

  return res.render('auth/login', { error: null, initialSetup, showAdminHint });
});

router.post('/login', blockIfLoggedIn('/pending'), async (req, res) => {
  const usernameRaw = req.body?.username;
  const password = req.body?.password;
  const username = String(usernameRaw || '').trim();
  const initialSetup = await isInitialSetup();

  if (!username || !password) {
    return res.render('auth/login', { error: 'نام کاربری و رمز را وارد کنید.', initialSetup, showAdminHint: false });
  }

  try {
    // اگر هنوز Telegram Bot Token ست نشده → فقط ادمین سیستم باید از /admin/login ست کند
    if (initialSetup) {
      return res.render('auth/login', {
        error: 'سیستم هنوز راه‌اندازی نشده است. ادمین سیستم باید از مسیر /admin/login تنظیمات اولیه را انجام دهد.',
        initialSetup: true,
        showAdminHint: true
      });
    }

    const user = await authService.getUserByUsername(username);
    if (!user) {
      return res.render('auth/login', { error: 'نام کاربری یا رمز عبور اشتباه است.', initialSetup: false, showAdminHint: false });
    }

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      return res.render('auth/login', { error: 'نام کاربری یا رمز عبور اشتباه است.', initialSetup: false, showAdminHint: false });
    }

    const status = user.status || '';
    const pendingStatuses = ['pending_verification', 'pending_manager', 'pending_telegram'];
    if (user.active === false && !pendingStatuses.includes(status)) {
      return res.render('auth/login', { error: 'حساب کاربری شما غیرفعال است.', initialSetup: false, showAdminHint: false });
    }

    if (status === 'rejected') {
      return res.render('auth/login', { error: 'حساب شما توسط مدیر رد شده است.', initialSetup: false, showAdminHint: false });
    }

    let stage = FLOW_STAGES.NEED_TG_2FA;
    if (!user.telegram_id) {
      stage = FLOW_STAGES.REGISTERED;
    } else if (status === 'pending_verification' || status === 'pending_telegram') {
      stage = FLOW_STAGES.PRE_REGISTER_OK;
    }

    req.session.authFlow = {
      username,
      userId: user.id,
      stage,
      from: 'auth/login',
    };

    // Add explicit session save
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return reject(err);
        }
        resolve();
      });
    });

    if (stage === FLOW_STAGES.REGISTERED) {
      return res.redirect('/pre-register-info');
    }

    return res.redirect('/auth/telegram');
  } catch (err) {
    console.error('POST /login error:', err);
    return res.render('auth/login', { error: 'خطای داخلی سیستم.', initialSetup: false, showAdminHint: false });
  }
});


// Pending page (post-login holding page)
router.get('/pending', async (req, res) => {
  try {
    const sessionUser = req.session?.user || null;
    const flow = req.session?.authFlow || null;
    const flowAllowed = flow && [
      FLOW_STAGES.REGISTERED,
      FLOW_STAGES.PRE_REGISTER_OK,
      FLOW_STAGES.NEED_TG_2FA,
    ].includes(flow.stage);
    const username = sessionUser?.username || (flowAllowed ? flow?.username : null);
    if (!sessionUser && !flowAllowed) return res.redirect('/login');
    if (!username) return res.redirect('/login');

    // refresh from DB (status/telegram_id are the source of truth)
    const dbUser = await authService.getUserByUsername(username);
    if (!dbUser) {
      return req.session.destroy(() => res.redirect('/login'));
    }

    const normalizedUser = {
      id: dbUser.id,
      username: dbUser.username,
      display_name: [(dbUser.first_name || ''), (dbUser.last_name || '')].filter(Boolean).join(' ').trim(),
      role: dbUser.role,
      first_name: dbUser.first_name,
      last_name: dbUser.last_name,
    };

    if (dbUser.status === 'NEEDS_EDIT') return res.redirect('/register/edit');

    // after login, telegram auth is mandatory if not linked yet
    if (!dbUser.telegram_id) {
      req.session.authFlow = { ...(req.session.authFlow || {}), stage: FLOW_STAGES.REGISTERED, username: dbUser.username, from: flow?.from || 'auth/login', userId: dbUser.id };
      return res.redirect('/pre-register-info');
    }

    if (dbUser.status === 'pending_verification' || dbUser.status === 'pending_telegram') {
      req.session.authFlow = { ...(req.session.authFlow || {}), stage: FLOW_STAGES.PRE_REGISTER_OK, username: dbUser.username, from: flow?.from || 'auth/login', userId: dbUser.id };
      return res.redirect('/auth/telegram');
    }

    if (dbUser.status === 'pending_manager') {
      return res.render('auth/pending', { user: dbUser });
    }

    if (dbUser.active === false) {
      return res.render('auth/pending', { user: dbUser });
    }

    if (!req.session.user && flow?.stage === FLOW_STAGES.NEED_TG_2FA) {
      return res.redirect('/auth/telegram');
    }

    req.session.user = { ...(req.session.user || {}), ...normalizedUser };

    // Add explicit session save before redirect
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return reject(err);
        }
        resolve();
      });
    });

    // All users (regardless of role) redirect to /admin/dashboard after login
    return res.redirect('/admin/dashboard');
  } catch (e) {
    console.error('GET /pending error:', e);
    return res.render('auth/pending', { user: req.session?.user || null });
  }
});

router.get('/logout', (req, res) => {
  if (!req.session) return res.redirect('/login');
  req.session.destroy((err) => {
    if (err) {
      console.error('logout destroy session error:', err);
      res.clearCookie('connect.sid');
    }
    return res.redirect('/login');
  });
});

module.exports = router;
