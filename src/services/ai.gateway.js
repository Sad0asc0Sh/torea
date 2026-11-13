const CONSTANTS = require('../config/constants');

const {
  AI_LONG_WORD_LENGTH: LONG_WORD_LENGTH,
  AI_DIFFICULTY_BIAS: DIFFICULTY_BIAS,
  AI_LENGTH_SCORE_FACTOR: LENGTH_SCORE_FACTOR,
  AI_LENGTH_SCORE_MAX: LENGTH_SCORE_MAX,
  AI_CLARITY_SCORE_MAX: CLARITY_SCORE_MAX,
  AI_CLARITY_SCORE_FACTOR: CLARITY_SCORE_FACTOR,
  AI_BASE_SCORE_START: BASE_SCORE_START,
  AI_SUMMARY_WORD_TARGET: SUMMARY_WORD_TARGET,
  AI_KEY_POINTS_COUNT: KEY_POINTS_COUNT,
} = CONSTANTS;

function selectProvider(topic = {}) {
  const mode = (topic.provider_mode || 'hybrid').toLowerCase();
  const hasToken = !!(topic.token || '').trim();
  const hasBaseUrl = !!(topic.base_url || '').trim();

  if (mode === 'cloud') {
    return { provider: 'cloud', available: hasToken || hasBaseUrl };
  }
  if (mode === 'local') {
    return { provider: 'local', available: true };
  }
  // hybrid: prefer cloud only when token/base_url exists
  if (hasToken || hasBaseUrl) return { provider: 'cloud', available: true };
  return { provider: 'local', available: true };
}

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function computeScore({ transcript = '', difficulty_level = 'simple' }) {
  const clean = (transcript || '').replace(/\s+/g, ' ').trim();
  const words = clean ? clean.split(' ') : [];
  const wc = words.length;
  const longWords = words.filter((w) => w.length > LONG_WORD_LENGTH).length;
  const complexity = wc ? longWords / wc : 0;
  const difficultyBias = DIFFICULTY_BIAS[difficulty_level] ?? DIFFICULTY_BIAS.simple;
  const lengthScore = Math.min(LENGTH_SCORE_MAX, wc * LENGTH_SCORE_FACTOR);
  const clarityScore = Math.min(CLARITY_SCORE_MAX, complexity * CLARITY_SCORE_FACTOR);
  const base = BASE_SCORE_START + lengthScore + clarityScore + difficultyBias;
  return clampScore(base);
}

function buildSummary25(transcript = '') {
  const words = (transcript || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const summaryWords = words.slice(0, SUMMARY_WORD_TARGET);
  const filler = 'خلاصه';
  while (summaryWords.length < SUMMARY_WORD_TARGET) summaryWords.push(filler);
  return summaryWords.slice(0, SUMMARY_WORD_TARGET).join(' ');
}

function buildKeyPoints(transcript = '') {
  const phrases = (transcript || '').split(/[.!؟\n]/).map((p) => p.trim()).filter(Boolean);
  const base = phrases.length ? phrases : [(transcript || '').slice(0, 60)];
  const points = [];
  for (let i = 0; i < KEY_POINTS_COUNT; i += 1) {
    const text = base[i] || base[base.length - 1] || 'نکته مهم';
    points.push(`• ${text}`.trim());
  }
  return points.slice(0, KEY_POINTS_COUNT);
}

function buildCoachNotes({ topic, difficulty_level }) {
  const topicTitle = topic?.title || topic?.topic_key || 'موضوع';
  if (difficulty_level === 'strict') {
    return `روی دقت و انسجام پاسخ در ${topicTitle} تمرکز کن و مثال‌های مستند اضافه کن.`;
  }
  if (difficulty_level === 'logical') {
    return `جریان منطقی گفتگو درباره ${topicTitle} را حفظ کن و سه نکته کلیدی را روشن بگو.`;
  }
  return `پاسخ کوتاه و واضح درباره ${topicTitle} ارائه کن و از کلمات ساده استفاده کن.`;
}

async function analyzeTranscript({ transcript, topic = {}, difficulty_level = 'simple' }) {
  const provider = selectProvider(topic);
  const score = computeScore({ transcript, difficulty_level });
  if (!provider.available && provider.provider === 'cloud') {
    return {
      score,
      summary_25: null,
      key_points: [],
      coach_notes: null,
      error: 'missing_provider_token',
      provider: provider.provider,
    };
  }

  return {
    score,
    summary_25: buildSummary25(transcript),
    key_points: buildKeyPoints(transcript),
    coach_notes: buildCoachNotes({ topic, difficulty_level }),
    provider: provider.provider,
  };
}

module.exports = {
  analyzeTranscript,
  selectProvider,
  computeScore,
  buildSummary25,
  buildKeyPoints,
  buildCoachNotes,
};
