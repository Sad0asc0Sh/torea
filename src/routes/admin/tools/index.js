'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');
const fetch = require('node-fetch');
const { execFile } = require('child_process');
const router = express.Router();
const pool = require('../../../config/db');
const trainingEngine = require('../../../services/training.engine');
const systemAdminService = require('../../../services/systemAdmin.service');
const voiceService = require('../../../services/voice.service');
const trainingRepo = require('../../../services/training.repo');
const aiGateway = require('../../../services/ai.gateway');
const { fetchSttSettings } = require('../../../services/sttSettings.service');
const customerIndustriesService = require('../../../services/customerIndustries.service');
const automationRoutes = require('./automation.routes');
const negotiationPracticeRoutes = require('./negotiationPractice.routes');

const execFileAsync = util.promisify(execFile);
const DEFAULT_SPEAKER_MATCH = 0.6;
const CUSTOMER_NAME_MIN = 2;
const CUSTOMER_NAME_MAX = 120;
const MAX_AUDIO_UPLOAD_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_KEY_POINTS = 3;
const MAX_EXERCISES = 2;
const TEMP_VOICE_DIR = process.env.VOICE_TMP_DIR || '/tmp/toinfinity_voices';
let voiceLogColumnsCache = null;

function legacyRedirect(to) {
  return (req, res) => {
    const suffix = req.url && req.url !== '/' ? req.url : '';
    const target = `${to}${suffix}`;
    if (req.method === 'GET') return res.redirect(301, target);
    return res.redirect(307, target);
  };
}

function normalizeTranscript(t) {
  return (t || '').toString().trim();
}

function normalizeCustomerName(name) {
  return (name || '').toString().trim();
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampScore100(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num);
}

function parseDateOrNull(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function ensureTempVoiceDir() {
  await fs.promises.mkdir(TEMP_VOICE_DIR, { recursive: true });
  return TEMP_VOICE_DIR;
}

function safeTempPath(rawPath) {
  if (!rawPath) return null;
  const resolved = path.resolve(rawPath);
  const base = path.resolve(TEMP_VOICE_DIR);
  return resolved.startsWith(base) ? resolved : null;
}

async function cleanupTempVoice(rawPath) {
  const safePath = safeTempPath(rawPath);
  if (!safePath) return false;
  try {
    await fs.promises.unlink(safePath);
    return true;
  } catch (err) {
    return false;
  }
}

async function probeDurationSeconds(filePath) {
  if (!filePath) return null;
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const n = parseFloat((stdout || '').trim());
    if (Number.isFinite(n)) return Math.round(n);
  } catch (err) {
    return null;
  }
  return null;
}

async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const base =
    process.env.REVERSE_GEOCODE_URL ||
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lng}';
  const token = process.env.REVERSE_GEOCODE_TOKEN || null;
  try {
    const url = base.replace('{lat}', String(lat)).replace('{lng}', String(lng));
    const headers = token
      ? { Authorization: `Bearer ${token}` }
      : { 'User-Agent': 'Mozilla/5.0 (compatible; GenericClient/1.0)' };
    const resp = await fetch(url, { headers });
    const data = await resp.json().catch(() => ({}));
    const address =
      data?.display_name ||
      data?.address?.city ||
      data?.address?.town ||
      data?.address?.village ||
      data?.address?.county ||
      null;
    return address || null;
  } catch (err) {
    return null;
  }
}

const audioStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const dir = await voiceService.ensureAudioDir();
      cb(null, dir);
    } catch (err) {
      cb(err || new Error('FAILED_AUDIO_DIR'));
    }
  },
  filename: (req, file, cb) => {
    const audioId = voiceService.generateAudioId();
    const ext = voiceService.sanitizeExt(file?.originalname || '', file?.mimetype || '');
    req.savedAudioId = audioId;
    cb(null, voiceService.buildFilename(audioId, ext));
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: MAX_AUDIO_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const mime = (file?.mimetype || '').toLowerCase();
    const name = (file?.originalname || '').toLowerCase();
    const allowedExt = ['.wav', '.webm', '.mp3', '.m4a', '.ogg'];
    const ok = mime.startsWith('audio/') || allowedExt.some((ext) => name.endsWith(ext));
    if (!ok) {
      const err = new Error('ONLY_AUDIO_ALLOWED');
      err.code = 'INVALID_FILETYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

const VOICE_UPLOAD_DIR = path.join(__dirname, '../../../public/uploads/voices');

async function ensureVoiceUploadDir() {
  await fs.promises.mkdir(VOICE_UPLOAD_DIR, { recursive: true });
  return VOICE_UPLOAD_DIR;
}

const tempVoiceStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const dir = await ensureTempVoiceDir();
      cb(null, dir);
    } catch (err) {
      cb(err || new Error('VOICE_TMP_DIR_FAILED'));
    }
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file?.originalname || '') || '.webm').toLowerCase();
    const allowedExt = ['.wav', '.webm', '.mp3', '.m4a', '.ogg'];
    const safeExt = ext && ext.length <= 6 && allowedExt.includes(ext) ? ext : '.webm';
    const name = `temp_voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    cb(null, name);
  },
});

const voiceUploadStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const dir = await ensureVoiceUploadDir();
      cb(null, dir);
    } catch (err) {
      cb(err || new Error('VOICE_DIR_FAILED'));
    }
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file?.originalname || '') || '.webm').toLowerCase();
    const allowedExt = ['.wav', '.webm', '.mp3', '.m4a', '.ogg'];
    const safeExt = ext && ext.length <= 6 && allowedExt.includes(ext) ? ext : '.webm';
    const name = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    cb(null, name);
  },
});

const mediaVoiceUpload = multer({
  storage: voiceUploadStorage,
  limits: { fileSize: MAX_AUDIO_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const mime = (file?.mimetype || '').toLowerCase();
    const name = (file?.originalname || '').toLowerCase();
    const allowedExt = ['.wav', '.webm', '.mp3', '.m4a', '.ogg'];
    const ok = mime.startsWith('audio/') || allowedExt.some((ext) => name.endsWith(ext));
    if (!ok) {
      const err = new Error('ONLY_AUDIO_ALLOWED');
      err.code = 'INVALID_FILETYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

const tempVoiceUpload = multer({
  storage: tempVoiceStorage,
  limits: { fileSize: MAX_AUDIO_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const mime = (file?.mimetype || '').toLowerCase();
    const name = (file?.originalname || '').toLowerCase();
    const allowedExt = ['.wav', '.webm', '.mp3', '.m4a', '.ogg'];
    const ok = mime.startsWith('audio/') || allowedExt.some((ext) => name.endsWith(ext));
    if (!ok) {
      const err = new Error('ONLY_AUDIO_ALLOWED');
      err.code = 'INVALID_FILETYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

const columnCache = {};

async function fetchVoiceLogColumns() {
  if (voiceLogColumnsCache !== null) return voiceLogColumnsCache;
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='voice_logs'`
    );
    const cols = (res.rows || []).map((r) => r.column_name);
    voiceLogColumnsCache = cols.length ? cols : null;
  } catch (err) {
    voiceLogColumnsCache = null;
  }
  return voiceLogColumnsCache;
}

router.use('/tools/office-automation', automationRoutes);
router.use('/tools/practice', negotiationPracticeRoutes);

router.use('/tools/automation', legacyRedirect('/admin/tools/office-automation'));
router.use('/tools/negotiation-practice', legacyRedirect('/admin/tools/practice'));

async function transcribeTempFile({ tempPath, model_key }) {
  const safePath = safeTempPath(tempPath);
  if (!safePath) {
    const err = new Error('INVALID_TEMP_PATH');
    err.code = 'INVALID_TEMP_PATH';
    throw err;
  }
  try {
    await fs.promises.access(safePath, fs.constants.R_OK);
  } catch (err) {
    const e = new Error('TEMP_FILE_NOT_FOUND');
    e.code = 'TEMP_FILE_NOT_FOUND';
    throw e;
  }

  const stt = await fetchSttSettings();
  if (!stt.token || !stt.base_url) {
    const err = new Error('STT_NOT_CONFIGURED');
    err.code = 'STT_NOT_CONFIGURED';
    throw err;
  }

  const model = (model_key || stt.model_default || '').toString().trim();
  const url = stt.base_url.includes('{model}')
    ? stt.base_url.replace('{model}', model || '')
    : stt.base_url + (model ? `?model=${encodeURIComponent(model)}` : '');

  const headers = { 'Content-Type': 'application/octet-stream' };
  if (stt.token) headers.Authorization = `Bearer ${stt.token}`;

  const stream = fs.createReadStream(safePath);
  const resp = await fetch(url, { method: 'POST', headers, body: stream });
  const raw = await resp.text().catch(() => '');
  if (!resp.ok) {
    const err = new Error('STT_HTTP_ERROR');
    err.code = 'STT_HTTP_ERROR';
    err.details = raw;
    throw err;
  }

  let transcript = null;
  try {
    const parsed = JSON.parse(raw);
    transcript =
      parsed?.transcript ||
      parsed?.text ||
      parsed?.data ||
      parsed?.result ||
      parsed?.message ||
      null;
  } catch (e) {
    transcript = raw ? raw.trim() : null;
  }

  if (!transcript) {
    const err = new Error('STT_EMPTY');
    err.code = 'STT_EMPTY';
    throw err;
  }

  return {
    transcript: transcript.toString().trim(),
    model: model || null,
  };
}

async function ensureTrainingLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.training_logs (
      id SERIAL PRIMARY KEY,
      user_id uuid,
      transcript TEXT,
      speaker_match_score NUMERIC(5,2),
      suspicious BOOLEAN DEFAULT FALSE,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function logTrainingAttempt({ userId, transcript, speaker_match_score, suspicious, meta }) {
  const cols = await fetchVoiceLogColumns();
  if (cols && cols.includes('user_id') && cols.includes('transcript')) {
    const allowedCols = ['user_id', 'transcript', 'speaker_match_score', 'suspicious', 'meta'];
    const insertCols = ['user_id', 'transcript'];
    const values = [userId || null, transcript || ''];
    if (cols.includes('speaker_match_score') && allowedCols.includes('speaker_match_score')) {
      insertCols.push('speaker_match_score');
      values.push(speaker_match_score);
    }
    if (cols.includes('suspicious') && allowedCols.includes('suspicious')) {
      insertCols.push('suspicious');
      values.push(!!suspicious);
    }
    if (cols.includes('meta') && allowedCols.includes('meta')) {
      insertCols.push('meta');
      values.push(meta ? JSON.stringify(meta) : null);
    }
    const placeholders = insertCols.map((_, idx) => `$${idx + 1}`).join(', ');
    const res = await pool.query(
      `INSERT INTO public.voice_logs (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    return res.rows[0]?.id || null;
  }

  await ensureTrainingLogsTable();
  const res = await pool.query(
    `INSERT INTO public.training_logs (user_id, transcript, speaker_match_score, suspicious, meta)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId || null, transcript || '', speaker_match_score, !!suspicious, meta ? JSON.stringify(meta) : null]
  );
  return res.rows[0]?.id || null;
}

async function logNegotiationAnalysis({ userId, customer_name, transcript, speaker_match_score, suspicious, result }) {
  try {
    await pool.query(
      `INSERT INTO public.negotiation_analysis_logs
        (user_id, customer_name, audio_id, transcript, summary_25, key_points, score, rolling_avg, threshold, difficulty_level, current_topic_key, suspicious, speaker_match_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId || null,
        customer_name,
        null,
        transcript || '',
        result?.outputs?.summary_25 || null,
        result?.outputs?.key_points ? JSON.stringify(result.outputs.key_points) : null,
        result?.score ?? null,
        result?.rolling_avg ?? null,
        result?.threshold ?? null,
        result?.difficulty_level ?? null,
        result?.current_topic_key ?? null,
        !!suspicious,
        speaker_match_score ?? null,
      ]
    );
  } catch (err) {
    console.error('logNegotiationAnalysis failed:', err?.message || err, {
      userId,
      customer_name,
    });
  }
}

function resolveWeaknessFocus(engineResult = {}, topics = []) {
  const key = engineResult?.current_topic_key || null;
  if (!key) return null;
  const match = (topics || []).find((t) => t.topic_key === key);
  return match?.title || key;
}

function buildExercises({ weakness_focus, transcript, keyPoints }) {
  const focus = weakness_focus || 'مهارت مذاکره';
  const source = keyPoints && keyPoints.length ? keyPoints : aiGateway.buildKeyPoints(transcript || '') || [];
  const hints = source.slice(0, MAX_EXERCISES);
  const firstHint = hints[0] || focus;
  const secondHint = hints[1] || focus;
  return [
    `تمرین ۱: یک مکالمه کوتاه درباره «${focus}» ضبط کن و حتما ${firstHint} را به‌صورت واضح بیان کن.`,
    `تمرین ۲: در گفتگوی بعدی روی «${focus}» تمرکز کن و ${secondHint} را با مثال واقعی توضیح بده.`,
  ];
}

async function hasColumn(tableName, column) {
  const cacheKey = `${tableName}:${column}`;
  if (cacheKey in columnCache) return columnCache[cacheKey];
  try {
    const res = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
      [tableName, column]
    );
    const val = !!res.rows.length;
    columnCache[cacheKey] = val;
    return val;
  } catch (err) {
    columnCache[cacheKey] = false;
    return false;
  }
}

async function loadStrategicProductNames() {
  const hasTable = await hasColumn('products', 'name');
  if (!hasTable) return [];
  const strategicColumn = (await hasColumn('products', 'is_strategic')) ? 'is_strategic' : (await hasColumn('products', 'is_key')) ? 'is_key' : null;
  if (!strategicColumn) return [];
  try {
    const res = await pool.query(`SELECT name FROM public.products WHERE ${strategicColumn} = TRUE LIMIT 100`);
    return (res.rows || []).map((r) => (r.name || '').toString().trim()).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function detectForgottenStrategicProducts(transcript, strategicList = []) {
  if (!strategicList.length) return [];
  const text = (transcript || '').toLowerCase();
  const mentioned = new Set();
  strategicList.forEach((name) => {
    if (!name) return;
    const norm = name.toLowerCase();
    if (text.includes(norm)) {
      mentioned.add(name);
    }
  });
  return strategicList.filter((name) => !mentioned.has(name)).slice(0, 10);
}

async function saveNegotiationReport(payload = {}) {
  const sql = `
    INSERT INTO public.negotiation_analysis_reports
      (created_by_user_id, customer_name, customer_code, customer_industry_id, started_at, ended_at, duration_seconds, location_lat, location_lng, location_accuracy, address_auto, address_final, transcript_text, score, weakness_focus, exercises, missed_strategic_products, manager_summary_25, manager_key_points)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING id
  `;
  const values = [
    payload.userId || null,
    payload.customer_name,
    payload.customer_code || null,
    payload.customer_industry_id || null,
    payload.started_at,
    payload.ended_at,
    payload.duration_seconds,
    payload.location_lat,
    payload.location_lng,
    payload.location_accuracy,
    payload.address_auto || null,
    payload.address_final || null,
    payload.transcript_text || null,
    payload.score,
    payload.weakness_focus || null,
    payload.exercises ? JSON.stringify(payload.exercises) : null,
    payload.missed_strategic_products ? JSON.stringify(payload.missed_strategic_products) : null,
    payload.manager_summary_25 || null,
    payload.manager_key_points ? JSON.stringify(payload.manager_key_points) : null,
  ];
  try {
    const res = await pool.query(sql, values);
    return res.rows[0]?.id || null;
  } catch (err) {
    console.error('saveNegotiationReport failed:', err?.message || err);
    return null;
  }
}

async function fetchUserWithManager(userId) {
  if (!userId) return null;
  try {
    const res = await pool.query(
      `SELECT u.id,
              u.username,
              u.first_name,
              u.last_name,
              u.telegram_id,
              u.manager_id,
              mgr.telegram_id   AS manager_telegram_id,
              mgr.first_name    AS manager_first_name,
              mgr.last_name     AS manager_last_name,
              mgr.username      AS manager_username
         FROM users u
    LEFT JOIN users mgr ON mgr.id = u.manager_id
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  } catch (err) {
    return null;
  }
}

function formatName(user) {
  if (!user) return '';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.username || '';
}

function formatKeyPoints(list = []) {
  return (list || []).map((kp) => `• ${kp}`).join('\n');
}

function formatExercises(list = []) {
  return (list || []).map((ex, idx) => `${idx + 1}. ${ex}`).join('\n');
}

async function sendNegotiationTelegram({ userRow, report }) {
  if (!userRow?.telegram_id) return;
  const token = await systemAdminService.getTelegramBotToken();
  if (!token) return;
  const parts = [
    `گزارش تحلیل مذاکره`,
    report.customer_name ? `مشتری: ${report.customer_name}` : null,
    report.score !== null && report.score !== undefined ? `امتیاز: ${report.score}` : null,
    report.weakness_focus ? `ضعف/تمرکز: ${report.weakness_focus}` : null,
    report.manager_summary_25 ? `خلاصه کوتاه:\n${report.manager_summary_25}` : null,
    report.manager_key_points && report.manager_key_points.length
      ? `نکات کلیدی:\n${formatKeyPoints(report.manager_key_points)}`
      : null,
    report.exercises && report.exercises.length
      ? `تمرین‌ها:\n${formatExercises(report.exercises)}`
      : null,
    report.missed_strategic_products && report.missed_strategic_products.length
      ? `کالاهای جا افتاده:\n${report.missed_strategic_products.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    await systemAdminService.sendTelegramMessage(token, userRow.telegram_id, parts);
  } catch (err) {
    // ignore telegram errors for report flow
  }
}

async function sendTelegramMessages({ userRow, transcript, summary_25, key_points, phase, difficulty }) {
  if (!userRow || (!userRow.telegram_id && !userRow.manager_telegram_id)) return;
  const token = await systemAdminService.getTelegramBotToken();
  if (!token) {
    const err = new Error('Missing Telegram token');
    err.code = 'NO_TOKEN';
    throw err;
  }

  const keyPointsText = key_points && key_points.length ? formatKeyPoints(key_points) : null;
  const baseInfo = [
    `مرحله: ${phase === 'baseline' ? 'baseline' : 'training'}`,
    difficulty ? `سطح سختی: ${difficulty}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userText = [
    'خلاصه تمرین شما ثبت شد.',
    baseInfo,
    transcript ? `متن: ${transcript}` : null,
    keyPointsText ? `نکات کلیدی:\n${keyPointsText}` : null,
    summary_25 ? `خلاصه ۲۵ کلمه‌ای: ${summary_25}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (userRow?.telegram_id) {
    await systemAdminService.sendTelegramMessage(token, userRow.telegram_id, userText);
  }

  if (userRow?.manager_telegram_id) {
    const managerText = [
      'گزارش تمرین جدید',
      `کاربر: ${formatName(userRow) || userRow.username || 'ناشناس'}`,
      baseInfo,
      transcript ? `متن: ${transcript}` : null,
      summary_25 ? `خلاصه ۲۵ کلمه‌ای: ${summary_25}` : null,
      keyPointsText ? `نکات کلیدی:\n${keyPointsText}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    await systemAdminService.sendTelegramMessage(token, userRow.manager_telegram_id, managerText);
  }
}

// ========================================
// Voice Utility Endpoints
// ========================================

router.post('/tools/media/voice-temp-upload', (req, res) => {
  tempVoiceUpload.single('voice')(req, res, (err) => {
    if (err) {
      const isSize = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        ok: false,
        error: isSize ? 'FILE_TOO_LARGE' : err.code || 'UPLOAD_FAILED',
        message: isSize ? 'حداکثر حجم مجاز ۱۵ مگابایت است.' : err.message || 'آپلود ناموفق بود.',
      });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'NO_FILE', message: 'فایل صوتی ارسال نشد.' });
    }
    return res.json({
      ok: true,
      temp_path: req.file.path,
      mime: req.file.mimetype || null,
      size: req.file.size || null,
    });
  });
});

router.post('/tools/media/voice-upload', (req, res) => {
  mediaVoiceUpload.single('voice')(req, res, (err) => {
    if (err) {
      const isSize = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        ok: false,
        error: isSize ? 'FILE_TOO_LARGE' : err.code || 'UPLOAD_FAILED',
        message: isSize ? 'حداکثر حجم مجاز ۱۵ مگابایت است.' : err.message || 'آپلود ناموفق بود.',
      });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'NO_FILE', message: 'فایل صوتی ارسال نشد.' });
    }
    const voice_path = `/uploads/voices/${req.file.filename}`;
    return res.json({ ok: true, voice_path });
  });
});

router.post('/ai/transcribe', async (req, res) => {
  const temp_path = (req.body?.temp_path || '').toString().trim();
  const model_key = (req.body?.model_key || '').toString().trim();
  const safePath = safeTempPath(temp_path);
  if (!safePath) {
    return res
      .status(400)
      .json({ ok: false, error: 'INVALID_TEMP_PATH', message: 'مسیر فایل موقت معتبر نیست.' });
  }

  let duration_seconds = null;
  try {
    duration_seconds = await probeDurationSeconds(safePath);
    const result = await transcribeTempFile({ tempPath: safePath, model_key });
    return res.json({
      ok: true,
      text: result.transcript,
      model: result.model,
      duration_seconds,
    });
  } catch (err) {
    const code = err?.code || 'STT_FAILED';
    const message =
      code === 'STT_NOT_CONFIGURED'
        ? 'تنظیمات STT فعال نشده است. لطفاً متن را دستی وارد کنید.'
        : 'تبدیل گفتار به متن انجام نشد.';
    return res.status(400).json({ ok: false, error: code, message, duration_seconds });
  } finally {
    try {
      await cleanupTempVoice(safePath);
    } catch (e) {
      /* ignore cleanup error */
    }
  }
});

router.post('/tools/voice/upload', (req, res) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (err) {
      const isSize = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        ok: false,
        error: isSize ? 'FILE_TOO_LARGE' : err.code || 'UPLOAD_FAILED',
        message: isSize ? 'حداکثر حجم مجاز ۱۵ مگابایت است.' : err.message || 'آپلود ناموفق بود.',
      });
    }
    if (!req.file || !req.savedAudioId) {
      return res.status(400).json({ ok: false, error: 'NO_FILE', message: 'فایل صوتی ارسال نشد.' });
    }
    const mime = req.file.mimetype || voiceService.mimeFromExt(req.file.originalname || '');
    return res.json({ ok: true, audio_id: req.savedAudioId, mime });
  });
});

router.post('/tools/voice/duration', async (req, res) => {
  const audio_id = (req.body?.audio_id || '').toString().trim();
  const fallback = toNumberOrNull(req.body?.fallback_seconds);
  if (!audio_id) return res.status(400).json({ ok: false, error: 'AUDIO_ID_REQUIRED' });
  try {
    const duration_seconds = await voiceService.getDurationSeconds(audio_id, fallback);
    return res.json({ ok: true, duration_seconds });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.code || 'DURATION_FAILED',
      message: err.message || 'محاسبه زمان ناموفق بود.',
      duration_seconds: fallback !== null ? Math.round(fallback) : null,
    });
  }
});

router.post('/tools/voice/transcribe', async (req, res) => {
  const audio_id = (req.body?.audio_id || '').toString().trim();
  if (!audio_id) return res.status(400).json({ ok: false, error: 'AUDIO_ID_REQUIRED' });
  try {
    const transcript = await voiceService.transcribeAudio(audio_id);
    return res.json({ ok: true, transcript });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err.code || 'STT_FAILED',
      message: err.message || 'تبدیل گفتار به متن ناموفق بود.',
    });
  }
});

router.post('/tools/voice/cleanup', async (req, res) => {
  const audio_id = (req.body?.audio_id || '').toString().trim();
  if (!audio_id) return res.status(400).json({ ok: false, error: 'AUDIO_ID_REQUIRED' });
  try {
    const removed = await voiceService.cleanupAudio(audio_id);
    return res.json({ ok: true, removed });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, error: err.code || 'CLEANUP_FAILED', message: err.message || 'حذف فایل ناموفق بود.' });
  }
});

router.get('/tools', (req, res) => {
  res.render('admin/tools/index', {
    user: req.session?.user || null,
    message: 'ابزارهای کمکی مدیریت',
  });
});

router.get('/tools/training', (req, res) => {
  res.render('admin/tools/training', {
    user: req.session?.user || null,
    error: null,
    info: null,
    telegramError: null,
    result: null,
    transcript: '',
    speaker_match_score: DEFAULT_SPEAKER_MATCH,
    suspicious: false,
  });
});

router.post('/tools/training', async (req, res) => {
  const user = req.session?.user || null;
  const userId = user?.id || null;
  const transcript = normalizeTranscript(req.body?.transcript);
  const scoreRaw = req.body?.speaker_match_score;
  const parsedScore = parseFloat(scoreRaw);
  const speaker_match_score = Number.isFinite(parsedScore)
    ? Math.min(1, Math.max(0, parsedScore))
    : DEFAULT_SPEAKER_MATCH;
  const suspicious = speaker_match_score < 0.5;

  if (!transcript) {
    return res.render('admin/tools/training', {
      user,
      error: 'متن مکالمه را وارد کنید.',
      info: null,
      telegramError: null,
      result: null,
      transcript: '',
      speaker_match_score,
      suspicious,
    });
  }

  if (!userId) {
    return res.render('admin/tools/training', {
      user,
      error: 'کاربر وارد نشده است.',
      info: null,
      telegramError: null,
      result: null,
      transcript,
      speaker_match_score,
      suspicious,
    });
  }

  const meta = {
    tool: 'training',
    source: 'admin_tools',
    speaker_match_score,
    suspicious,
  };

  let result = null;
  let error = null;
  let info = null;
  let telegramError = null;

  let voiceLogId = null;
  try {
    voiceLogId = await logTrainingAttempt({ userId, transcript, speaker_match_score, suspicious, meta });
  } catch (e) {
    console.error('logTrainingAttempt failed:', e?.message || e);
  }

  try {
    result = await trainingEngine.processVoice({ userId, transcript, meta, voiceLogId });
  } catch (err) {
    error = 'پردازش با خطا مواجه شد. دوباره تلاش کنید.';
    return res.render('admin/tools/training', {
      user,
      error,
      info,
      telegramError,
      result: null,
      transcript,
      speaker_match_score,
      suspicious,
    });
  }

  try {
    const userRow = await fetchUserWithManager(userId);
    const outputs = result?.outputs || {};
    await sendTelegramMessages({
      userRow,
      transcript,
      summary_25: outputs.summary_25,
      key_points: outputs.key_points || [],
      phase: result?.phase,
      difficulty: result?.difficulty_level,
    });
  } catch (err) {
    if (err && err.code === 'NO_TOKEN') {
      telegramError = 'توکن تلگرام تنظیم نشده است.';
    } else {
      telegramError = 'ارسال تلگرام انجام نشد.';
    }
  }

  if (result?.phase === 'baseline') {
    info = 'سطح شما تعیین شد. برای ادامه، چند نمونه دیگر ارسال کنید.';
  }

  return res.render('admin/tools/training', {
    user,
    error,
    info,
    telegramError,
    result,
    transcript,
    speaker_match_score,
    suspicious,
  });
});

// ========================================
// Negotiation Analysis Routes
// ========================================

router.get('/tools/negotiation-analysis', (req, res) => {
  customerIndustriesService
    .listActiveCustomerIndustries()
    .then((industries) => {
      res.render('admin/tools/negotiation_analysis', {
        user: req.session?.user || null,
        error: null,
        result: null,
        transcript_text: '',
        customer_name: '',
        customer_code: '',
        customer_industry_id: '',
        duration_seconds: null,
        started_at: '',
        ended_at: '',
        location: null,
        address_auto: '',
        address_final: '',
        stt_error: null,
        industries: industries || [],
      });
    })
    .catch(() => {
      res.render('admin/tools/negotiation_analysis', {
        user: req.session?.user || null,
        error: null,
        result: null,
        transcript_text: '',
        customer_name: '',
        customer_code: '',
        customer_industry_id: '',
        duration_seconds: null,
        started_at: '',
        ended_at: '',
        location: null,
        address_auto: '',
        address_final: '',
        stt_error: null,
        industries: [],
      });
    });
});

async function handleNegotiationAnalysisSubmit(req, res) {
  const user = req.session?.user || null;
  const userId = user?.id || null;
  const industries = await customerIndustriesService.listActiveCustomerIndustries().catch(() => []);

  const customer_name = normalizeCustomerName(req.body?.customer_name);
  const customer_code = (req.body?.customer_code || '').toString().trim();
  const customer_industry_id = toNumberOrNull(req.body?.customer_industry_id);
  const transcript_text = normalizeTranscript(req.body?.transcript_text);
  let started_at = parseDateOrNull(req.body?.started_at);
  let ended_at = parseDateOrNull(req.body?.ended_at);
  let duration_seconds = null;
  if (started_at && ended_at) {
    const diffMs = ended_at.getTime() - started_at.getTime();
    if (diffMs > 0) {
      duration_seconds = Math.max(1, Math.round(diffMs / 1000));
    }
  }
  if (!duration_seconds) {
    const fallback = toNumberOrNull(req.body?.duration_seconds);
    if (fallback) {
      duration_seconds = Math.max(1, Math.round(fallback));
      if (started_at && !ended_at) {
        ended_at = new Date(started_at.getTime() + duration_seconds * 1000);
      }
      if (!started_at && ended_at) {
        started_at = new Date(ended_at.getTime() - duration_seconds * 1000);
      }
    }
  }

  const location = {
    lat: toNumberOrNull(req.body?.geo_lat),
    lng: toNumberOrNull(req.body?.geo_lng),
    accuracy: toNumberOrNull(req.body?.geo_accuracy_m),
  };

  const baseRender = (errorMsg, extras = {}) =>
    res.render('admin/tools/negotiation_analysis', {
      user,
      error: errorMsg,
      result: null,
      transcript_text,
      customer_name,
      customer_code,
      customer_industry_id: customer_industry_id || '',
      duration_seconds,
      started_at: started_at ? started_at.toISOString() : '',
      ended_at: ended_at ? ended_at.toISOString() : '',
      location,
      address_auto: extras.address_auto || req.body?.address_auto || '',
      address_final: req.body?.address_final || '',
      stt_error: extras.stt_error || null,
      industries,
    });

  if (!userId) return baseRender('کاربر وارد نشده است.');
  if (!customer_name) return baseRender('نام مشتری/فروشگاه الزامی است.');
  if (customer_name.length < CUSTOMER_NAME_MIN || customer_name.length > CUSTOMER_NAME_MAX) {
    return baseRender('نام مشتری/فروشگاه باید بین ۲ تا ۱۲۰ کاراکتر باشد.');
  }
  if (!started_at || !ended_at || !duration_seconds) {
    return baseRender('زمان شروع و پایان مکالمه مشخص نیست.');
  }
  if (!transcript_text) {
    return baseRender('متن مکالمه در دسترس نیست. لطفاً دوباره ضبط کنید یا متن را دستی وارد کنید.');
  }

  let address_auto = (req.body?.address_auto || '').toString().trim();
  if (!address_auto && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    address_auto = (await reverseGeocode(location.lat, location.lng)) || '';
  }
  const address_final = (req.body?.address_final || '').toString().trim() || address_auto || null;

  const meta = {
    tool: 'negotiation_analysis',
    source: 'admin_tools',
    customer_name,
    customer_code,
    customer_industry_id,
    duration_seconds,
    location,
  };

  let result = null;
  let topics = [];
  try {
    result = await trainingEngine.processVoice({
      userId,
      transcript: transcript_text,
      meta,
      voiceLogId: null,
    });
  } catch (err) {
    return baseRender('پردازش با خطا مواجه شد. لطفاً بعداً تلاش کنید.');
  }

  try {
    topics = await trainingRepo.getEnabledTopicsOrdered();
  } catch (e) {
    topics = [];
  }

  const outputs = result?.outputs || {};
  const key_points_raw = outputs.key_points || [];
  const key_points = key_points_raw.slice(0, MAX_KEY_POINTS);
  const summary_25 = outputs.summary_25 || null;
  const weakness_focus = resolveWeaknessFocus(result, topics);
  const score = clampScore100(result?.score ?? 0);
  const exercises = buildExercises({ weakness_focus, transcript: transcript_text, keyPoints: key_points }).slice(
    0,
    MAX_EXERCISES
  );
  const strategicList = await loadStrategicProductNames();
  const missed_strategic_products = detectForgottenStrategicProducts(transcript_text, strategicList);

  // Persist exactly MAX_KEY_POINTS items for manager reporting; pad with blanks if fewer.
  const manager_key_points = Array.from(
    { length: MAX_KEY_POINTS },
    (_, idx) => key_points_raw[idx] || ''
  );

  const savedId = await saveNegotiationReport({
    userId,
    customer_name,
    customer_code,
    customer_industry_id,
    started_at,
    ended_at,
    duration_seconds,
    location_lat: location.lat,
    location_lng: location.lng,
    location_accuracy: location.accuracy,
    address_auto: address_auto || null,
    address_final,
    transcript_text,
    score,
    weakness_focus,
    exercises,
    missed_strategic_products,
    manager_summary_25: summary_25,
    manager_key_points,
  });

  try {
    const userRow = await fetchUserWithManager(userId);
    await sendNegotiationTelegram({
      userRow,
      report: {
        customer_name,
        score,
        weakness_focus,
        exercises,
        missed_strategic_products,
        manager_summary_25: summary_25,
        manager_key_points,
      },
    });
  } catch (err) {
    /* ignore telegram errors */
  }

  const finalResult = {
    id: savedId,
    transcript: transcript_text,
    manager_summary_25: summary_25,
    manager_key_points,
    weakness_focus,
    score,
    exercises,
    missed_strategic_products,
    duration_seconds,
    location,
    customer_name,
    customer_code,
    customer_industry_id,
    address_auto: address_auto || null,
    address_final,
    started_at: started_at ? started_at.toISOString() : null,
    ended_at: ended_at ? ended_at.toISOString() : null,
  };

  return res.render('admin/tools/negotiation_analysis', {
    user,
    error: null,
    result: finalResult,
    transcript_text,
    customer_name,
    customer_code,
    customer_industry_id: customer_industry_id || '',
    duration_seconds,
    started_at: started_at ? started_at.toISOString() : '',
    ended_at: ended_at ? ended_at.toISOString() : '',
    location,
    address_auto: address_auto || '',
    address_final,
    stt_error: null,
    industries,
  });
}

router.post('/tools/negotiation-analysis/submit', handleNegotiationAnalysisSubmit);
router.post('/tools/negotiation-analysis', handleNegotiationAnalysisSubmit);

module.exports = router;
