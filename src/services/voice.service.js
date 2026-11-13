'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const { execFile } = require('child_process');
const fetch = require('node-fetch');

const execFileAsync = util.promisify(execFile);
const AUDIO_DIR = process.env.VOICE_TMP_DIR || '/tmp/toinfinity_audio';
const ALLOWED_EXTS = ['webm', 'wav', 'mp3', 'm4a', 'ogg'];
const MIME_MAP = {
  wav: 'audio/wav',
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/m4a',
  ogg: 'audio/ogg',
};

function mimeFromExt(ext) {
  return MIME_MAP[ext] || 'application/octet-stream';
}

async function ensureAudioDir() {
  await fs.promises.mkdir(AUDIO_DIR, { recursive: true });
  return AUDIO_DIR;
}

function getAudioDir() {
  return AUDIO_DIR;
}

function generateAudioId() {
  return `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeExt(originalName = '', mime = '') {
  const lower = String(originalName || '').toLowerCase();
  const ext = path.extname(lower).replace('.', '');
  if (ALLOWED_EXTS.includes(ext)) return ext;
  if (mime && mime.startsWith('audio/')) {
    const guess = mime.split('/')[1] || '';
    if (ALLOWED_EXTS.includes(guess)) return guess;
  }
  return 'webm';
}

function buildFilename(audioId, ext) {
  const safeExt = sanitizeExt(`.${ext || ''}`);
  return `${audioId}.${safeExt}`;
}

async function findAudioFile(audioId) {
  if (!audioId) return null;
  const dir = await ensureAudioDir().catch(() => null);
  if (!dir) return null;
  const files = await fs.promises.readdir(dir).catch(() => []);
  const match = files.find((f) => f.startsWith(`${audioId}.`));
  if (!match) return null;
  const ext = path.extname(match).replace('.', '');
  return {
    path: path.join(dir, match),
    ext,
    mime: mimeFromExt(ext),
  };
}

async function cleanupAudio(audioId) {
  if (!audioId) return false;
  const dir = await ensureAudioDir().catch(() => null);
  if (!dir) return false;
  const files = await fs.promises.readdir(dir).catch(() => []);
  let removed = false;
  for (const file of files) {
    if (file.startsWith(`${audioId}.`)) {
      try {
        await fs.promises.unlink(path.join(dir, file));
        removed = true;
      } catch (err) {
        /* ignore */
      }
    }
  }
  return removed;
}

async function probeDuration(filePath) {
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

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function getDurationSeconds(audioId, fallbackSeconds = null) {
  const file = await findAudioFile(audioId);
  if (!file) {
    const err = new Error('Audio not found');
    err.code = 'AUDIO_NOT_FOUND';
    throw err;
  }
  const probed = await probeDuration(file.path);
  if (Number.isFinite(probed)) return probed;
  const fb = numberOrNull(fallbackSeconds);
  return fb !== null ? Math.round(fb) : null;
}

async function readResponseAsText(res) {
  try {
    return await res.text();
  } catch (err) {
    return '';
  }
}

async function callSttEndpoint({ url, token, filePath }) {
  const headers = { 'Content-Type': 'application/octet-stream' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const stream = fs.createReadStream(filePath);
  const res = await fetch(url, { method: 'POST', headers, body: stream });
  const raw = await readResponseAsText(res);
  if (!res.ok) {
    const err = new Error(`STT request failed (${res.status})`);
    err.code = 'STT_HTTP_ERROR';
    err.details = raw;
    throw err;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = null;
  }
  const transcript =
    (parsed && (parsed.transcript || parsed.text || parsed.data || parsed.result)) ||
    (raw ? raw.trim() : '');
  if (transcript) return transcript.toString().trim();
  const err = new Error('STT response missing transcript');
  err.code = 'STT_EMPTY';
  throw err;
}

async function transcribeAudio(audioId) {
  const file = await findAudioFile(audioId);
  if (!file) {
    const err = new Error('Audio not found');
    err.code = 'AUDIO_NOT_FOUND';
    throw err;
  }

  const cloudUrl = process.env.CLOUD_STT_URL || process.env.CLOUD_STT_ENDPOINT || null;
  const cloudToken = process.env.CLOUD_STT_TOKEN || process.env.CLOUD_STT || null;
  const localUrl = process.env.LOCAL_STT_URL || process.env.LOCAL_STT || null;

  if (cloudUrl && cloudToken) {
    return callSttEndpoint({ url: cloudUrl, token: cloudToken, filePath: file.path });
  }

  if (localUrl) {
    return callSttEndpoint({ url: localUrl, token: null, filePath: file.path });
  }

  const err = new Error('Speech-to-text not configured');
  err.code = 'STT_NOT_CONFIGURED';
  throw err;
}

module.exports = {
  ensureAudioDir,
  getAudioDir,
  generateAudioId,
  sanitizeExt,
  buildFilename,
  findAudioFile,
  cleanupAudio,
  getDurationSeconds,
  transcribeAudio,
  mimeFromExt,
};
