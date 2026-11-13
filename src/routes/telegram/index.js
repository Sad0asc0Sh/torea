const express = require('express');
const fetch = require('node-fetch');
const telegramAuthService = require('../../services/telegramAuth.service');
const authService = require('../../services/auth.service');
const { TELEGRAM_ALLOWED_STAGES, FLOW_STAGES } = require('../../middlewares/flowGuards');
const { formatOtpIntro, normalizeOtpCode, throwIfTelegramErrors } = require('../../utils/telegramOtp');

const router = express.Router();

function norm(v) {
  return String(v || '').trim();
}

const VERIFIED_TELEGRAM_STAGES = ['pending_manager', 'active'];
const PENDING_TELEGRAM_STAGES = ['pending_verification', 'pending_telegram'];

function computeShowStep1(user) {
  const status = norm(user?.status);
  const hasTelegram = !!norm(user?.telegram_id);
  const isVerifiedStage = VERIFIED_TELEGRAM_STAGES.includes(status);
  const isPendingStage = PENDING_TELEGRAM_STAGES.includes(status);

  if (isVerifiedStage) return false;
  return isPendingStage || !hasTelegram;
}

function buildViewState(user) {
  const showStep1 = computeShowStep1(user);
  const telegramPrefill = showStep1 ? norm(user?.telegram_id) : '';

  return {
    showStep1,
    canEditTelegramId: showStep1,
    telegramPrefill,
  };
}

// ترجیح با authFlow است تا در میانه‌ی لاگین، همان کاربر ادامه یابد؛ در غیر این صورت از سشن کاربر فعال استفاده می‌کنیم.
function getFlowUsername(req) {
  const flowUser = req.session?.authFlow?.username;
  const sessionUser = req.session?.user?.username;
  return norm(flowUser || sessionUser || '');
}

// ✅ Source of truth: DB (system_settings.telegram_bot_token)
// ⛑️ Fallback: ENV فقط وقتی DB خالی است (برای بوت‌استرپ)
async function getTelegramBotToken() {
  const dbVal = await authService.getSystemSetting('telegram_bot_token').catch(() => null);
  const tdb = norm(dbVal);
  if (tdb) return tdb;

  const tenv = norm(process.env.TELEGRAM_BOT_TOKEN);
  if (tenv) return tenv;

  return null;
}

async function sendTelegramCode(telegram_id, first_name, code) {
  const token = await getTelegramBotToken();
  if (!token) {
    const err = new Error('TELEGRAM_BOT_TOKEN not configured (DB/ENV empty)');
    err.code = 'NO_TOKEN';
    throw err;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const intro = formatOtpIntro(first_name);
  const messages = [
    { body: { chat_id: telegram_id, text: intro }, step: 'intro' },
    { body: { chat_id: telegram_id, text: normalizeOtpCode(code) }, step: 'code' },
  ];

  const errors = [];
  for (const { body, step } of messages) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!j.ok) {
        const err = new Error('Telegram sendMessage failed');
        err.code = 'TELEGRAM_SEND_FAILED';
        err.details = j;
        errors.push({ step, error: err });
      }
    } catch (e) {
      errors.push({ step, error: e });
    }
  }

  throwIfTelegramErrors(errors);
}

const flowRedirect = (flow) => (flow?.stage === FLOW_STAGES.REGISTERED ? '/pre-register-info' : '/login');

// این گارد هم برای مراحل جریان احراز هویت (authFlow) و هم برای کاربران لاگین‌شده که نیاز به TG 2FA دارند استفاده می‌شود.
function ensureTelegramSession(req, res, next) {
  const queryUsername = norm(req.query?.username);
  const flow = req.session?.authFlow;
  const username = getFlowUsername(req);
  if (queryUsername && queryUsername !== username) {
    // امنیت: اجازه تغییر کاربر هدف با کوئری‌استرینگ را نمی‌دهیم
    return res.redirect('/login');
  }
  if (!username) return res.redirect('/login');
  if (flow && TELEGRAM_ALLOWED_STAGES.includes(flow.stage)) return next();
  if (req.session?.user) return next();

  return res.redirect(flowRedirect(flow));
}

router.get('/auth/telegram', ensureTelegramSession, async (req, res) => {
  const username = getFlowUsername(req);
  if (!username) return res.redirect('/login');

  try {
    const user = await telegramAuthService.getUserByUsername(username);
    if (!user) return res.redirect('/login');

    const viewState = buildViewState(user);
    return res.render('auth/telegram_auth', {
      error: null,
      info: null,
      username,
      telegram_id: viewState.telegramPrefill,
      showStep1: viewState.showStep1,
      canEditTelegramId: viewState.canEditTelegramId,
    });
  } catch (err) {
    console.error('get telegram auth page error:', err);
    return res.redirect('/login');
  }
});

router.post('/auth/telegram/send-code', ensureTelegramSession, async (req, res) => {
  const username = getFlowUsername(req);
  const telegram_id_raw = norm(req.body?.telegram_id);

  let error = null;
  let info = null;

  if (!username) {
    return res.redirect('/login');
  }

  try {
    const user = await telegramAuthService.getUserByUsername(username);
    if (!user) {
      error = 'کاربری با این نام کاربری پیدا نشد.';
      return res.render('auth/telegram_auth', {
        error,
        info,
        username,
        telegram_id: '',
        showStep1: false,
        canEditTelegramId: false,
      });
    }

    const viewState = buildViewState(user);
    const code = String(Math.floor(100000 + Math.random() * 900000));

    let targetTelegramId = norm(user.telegram_id);

    if (viewState.canEditTelegramId) {
      // در صورت خالی بودن input، از مقدار ذخیره‌شده استفاده می‌کنیم (اگر وجود دارد)
      targetTelegramId = telegram_id_raw || targetTelegramId;
      if (!targetTelegramId) {
        error = 'آیدی تلگرام اجباری است.';
        return res.render('auth/telegram_auth', {
          error,
          info,
          username,
          telegram_id: '',
          showStep1: viewState.showStep1,
          canEditTelegramId: viewState.canEditTelegramId,
        });
      }

      await telegramAuthService.setTelegramAndCodePending({
        user_id: user.id,
        telegram_id: targetTelegramId,
        code,
      });
    } else {
      const storedTelegramId = norm(targetTelegramId);
      if (!storedTelegramId) {
        error = 'آیدی تلگرام شما ثبت نشده است.';
        return res.status(400).render('auth/telegram_auth', {
          error,
          info,
          username,
          telegram_id: '',
          showStep1: viewState.showStep1,
          canEditTelegramId: viewState.canEditTelegramId,
        });
      }

      if (telegram_id_raw && telegram_id_raw !== storedTelegramId) {
        console.warn('Telegram ID change attempt blocked', {
          username,
          incoming: telegram_id_raw,
          stored: storedTelegramId,
        });
        error = 'درخواست نامعتبر است.';
        return res.status(403).render('auth/telegram_auth', {
          error,
          info,
          username,
          telegram_id: '',
          showStep1: viewState.showStep1,
          canEditTelegramId: viewState.canEditTelegramId,
        });
      }

      targetTelegramId = storedTelegramId;
      await telegramAuthService.setVerificationCodeOnly({
        user_id: user.id,
        code,
      });
    }

    try {
      await sendTelegramCode(targetTelegramId, user.first_name, code);
      info = 'کد احراز هویت به تلگرام شما ارسال شد. کد را در فرم پایین وارد کنید.';
    } catch (e) {
      if (e && e.code === 'NO_TOKEN') return res.redirect('/admin/first-setup');
      console.error('sendTelegramCode error:', e);
      error = 'کد در سیستم ثبت شد، اما ارسال تلگرام با خطا مواجه شد.';
    }

    const nextViewState = viewState.canEditTelegramId ? buildViewState({ ...user, telegram_id: targetTelegramId }) : viewState;
    return res.render('auth/telegram_auth', {
      error,
      info,
      username,
      telegram_id: nextViewState.telegramPrefill,
      showStep1: nextViewState.showStep1,
      canEditTelegramId: nextViewState.canEditTelegramId,
    });
  } catch (err) {
    console.error('send-code error:', err);
    error = 'خطا در ارسال کد. دوباره تلاش کنید.';
    return res.render('auth/telegram_auth', {
      error,
      info,
      username,
      telegram_id: '',
      showStep1: false,
      canEditTelegramId: false,
    });
  }
});

router.post('/auth/telegram/verify-code', ensureTelegramSession, async (req, res) => {
  const username = getFlowUsername(req);
  const code = norm(req.body?.code);

  let error = null;
  let info = null;

  if (!username) {
    return res.redirect('/login');
  }

  try {
    // امنیت: همیشه کاربر را از DB با هویت سشن می‌خوانیم
    const currentUser = await telegramAuthService.getUserByUsername(username);
    if (!currentUser) return res.redirect('/login');

    const viewState = buildViewState(currentUser);

    if (!code) {
      error = 'کد احراز را وارد کنید.';
      return res.render('auth/telegram_auth', {
        error,
        info,
        username,
        telegram_id: viewState.telegramPrefill,
        showStep1: viewState.showStep1,
        canEditTelegramId: viewState.canEditTelegramId,
      });
    }

    const result = await telegramAuthService.verifyCodeAndActivate({ username, code });

    if (!result.ok) {
      error = (result.reason === 'NOT_FOUND')
        ? 'کاربری با این نام کاربری پیدا نشد.'
        : 'کد وارد شده صحیح نیست.';
      return res.render('auth/telegram_auth', {
        error,
        info,
        username,
        telegram_id: viewState.telegramPrefill,
        showStep1: viewState.showStep1,
        canEditTelegramId: viewState.canEditTelegramId,
      });
    }

    try {
      const u = await telegramAuthService.getUserByUsername(username);
      if (u) {
        req.session.user = {
          id: u.id,
          username: u.username,
          display_name: [(u.first_name || ''), (u.last_name || '')].filter(Boolean).join(' ').trim(),
          role: u.role,
          first_name: u.first_name,
          last_name: u.last_name,
        };
      }
    } catch (e) {}

    delete req.session.authFlow;

    // تصمیم نهایی (approved / not approved) داخل /pending انجام می‌شود.
    return res.redirect('/pending');
  } catch (err) {
    console.error('verify-code error:', err);
    error = 'خطا در بررسی کد. دوباره تلاش کنید.';
    return res.render('auth/telegram_auth', {
      error,
      info,
      username,
      telegram_id: '',
      showStep1: false,
      canEditTelegramId: false,
    });
  }
});

module.exports = router;
