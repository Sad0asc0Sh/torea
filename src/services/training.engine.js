const repo = require('./training.repo');
const aiGateway = require('./ai.gateway');

const LONG_WORD_LENGTH = 6;
const DIFFICULTY_WEIGHT_WORDCOUNT = 0.4;
const DIFFICULTY_WEIGHT_COMPLEXITY = 30;
const DIFFICULTY_META_BONUS = 0.05;
const DIFFICULTY_META_SCALE = 100;
const STRICT_SCORE_THRESHOLD = 90;
const STRICT_WORD_THRESHOLD = 120;
const LOGICAL_SCORE_THRESHOLD = 45;
const LOGICAL_WORD_THRESHOLD = 45;
const KEY_POINTS_LIMIT = 3;

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function evaluateDifficulty(transcript = '', meta = {}) {
  const text = (transcript || '').toString().replace(/\s+/g, ' ').trim();
  if (!text) return 'simple';
  const words = text.split(' ');
  const wc = words.length;
  const longWords = words.filter((w) => w.length > LONG_WORD_LENGTH).length;
  const complexity = wc ? longWords / wc : 0;
  const clarityBoost = meta.tool === 'negotiation' || meta.tool === 'training' ? DIFFICULTY_META_BONUS : 0;
  const score =
    wc * DIFFICULTY_WEIGHT_WORDCOUNT + complexity * DIFFICULTY_WEIGHT_COMPLEXITY + clarityBoost * DIFFICULTY_META_SCALE;
  if (score >= STRICT_SCORE_THRESHOLD || wc > STRICT_WORD_THRESHOLD) return 'strict';
  if (score >= LOGICAL_SCORE_THRESHOLD || wc > LOGICAL_WORD_THRESHOLD) return 'logical';
  return 'simple';
}

function pickFirstEnabledTopic(topics = []) {
  if (!Array.isArray(topics) || !topics.length) return null;
  return topics[0]?.topic_key || null;
}

function findTopic(topics = [], topicKey = null) {
  if (!topicKey) return null;
  return topics.find((t) => t.topic_key === topicKey) || null;
}

function nextTopicKey(topics = [], currentKey = null) {
  if (!topics.length || !currentKey) return null;
  const idx = topics.findIndex((t) => t.topic_key === currentKey);
  if (idx === -1) return null;
  const next = topics[idx + 1];
  return next ? next.topic_key : null;
}

async function processVoice(input = {}, deps = {}) {
  const { userId, transcript = '', meta = {}, voiceLogId = null } = input;
  const repoSvc = deps.repo || repo;
  const aiSvc = deps.aiGateway || aiGateway;

  if (!userId) {
    const err = new Error('userId is required');
    err.code = 'ERR_USER_ID_REQUIRED';
    throw err;
  }

  const settings = (await repoSvc.getCompanyTrainingSettings()) || repo.DEFAULT_SETTINGS;
  const topics = await repoSvc.getEnabledTopicsOrdered();
  const existingState =
    (await repoSvc.getUserTrainingState(userId)) || {
      user_level: 1,
      baseline_done: false,
      baseline_voice_count: 0,
      difficulty_level: null,
      current_topic_key: null,
      cycle_id: 1,
    };

  if (!existingState.baseline_done) {
    const difficulty_level = evaluateDifficulty(transcript, meta) || existingState.difficulty_level || 'simple';
    const newCount = (existingState.baseline_voice_count || 0) + 1;
    const baselineDoneNow = newCount >= settings.baseline_voices_count;
    await repoSvc.upsertUserTrainingState(userId, {
      ...existingState,
      baseline_voice_count: newCount,
      baseline_done: baselineDoneNow,
      difficulty_level,
    });

    return {
      phase: 'baseline',
      difficulty_level,
      current_topic_key: null,
      score: null,
      rolling_avg: null,
      threshold: settings.threshold_score,
      unlocked_next: false,
      leveled_up: false,
      user_level: existingState.user_level || 1,
      outputs: {},
    };
  }

  let currentTopicKey = existingState.current_topic_key || pickFirstEnabledTopic(topics);
  let topic = findTopic(topics, currentTopicKey);
  if (!topic && topics.length) {
    topic = topics[0];
    currentTopicKey = topic.topic_key;
  }

  const difficulty_level = existingState.difficulty_level || evaluateDifficulty(transcript, meta);
  let aiResult = { score: 0, summary_25: null, key_points: [], coach_notes: null };
  try {
    aiResult = await aiSvc.analyzeTranscript({ transcript, topic, difficulty_level });
  } catch (err) {
    aiResult.error = err?.message || 'analysis_failed';
  }

  let rollingAvg = null;
  let unlockedNext = false;
  let leveledUp = false;
  let nextKey = currentTopicKey;
  let userLevel = existingState.user_level || 1;
  let cycleId = existingState.cycle_id || 1;

  if (topic && currentTopicKey) {
    const normalizedScore = clampScore(aiResult.score);
    await repoSvc.insertTrainingScore({
      userId,
      topicKey: currentTopicKey,
      score: normalizedScore,
      voiceLogId,
    });
    rollingAvg = await repoSvc.getRollingAverage(userId, currentTopicKey, settings.rolling_window_n);
    unlockedNext = rollingAvg !== null && rollingAvg >= settings.threshold_score;
    const candidateNext = nextTopicKey(topics, currentTopicKey);
    if (unlockedNext && candidateNext) {
      nextKey = candidateNext;
    }
  }

  const allTopicStatuses = await repoSvc.getAllTopicsStatusForUser(
    userId,
    settings.rolling_window_n,
    settings.threshold_score
  );
  const hasTopics = topics.length > 0;
  const allMet = hasTopics && allTopicStatuses.length === topics.length && allTopicStatuses.every((t) => t.met_threshold);

  if (allMet) {
    leveledUp = true;
    userLevel += 1;
    cycleId += 1;
    nextKey = pickFirstEnabledTopic(topics);
    unlockedNext = false;
  }

  await repoSvc.upsertUserTrainingState(userId, {
    ...existingState,
    baseline_done: true,
    current_topic_key: nextKey,
    difficulty_level,
    user_level: userLevel,
    cycle_id: cycleId,
  });

  const outputs = {};
  if (aiResult.summary_25) outputs.summary_25 = aiResult.summary_25;
  if (aiResult.key_points && aiResult.key_points.length) outputs.key_points = aiResult.key_points.slice(0, KEY_POINTS_LIMIT);
  if (aiResult.coach_notes) outputs.coach_notes = aiResult.coach_notes;

  return {
    phase: 'training',
    difficulty_level,
    current_topic_key: nextKey,
    score: clampScore(aiResult.score),
    rolling_avg: rollingAvg,
    threshold: settings.threshold_score,
    unlocked_next: unlockedNext,
    leveled_up: leveledUp,
    user_level: userLevel,
    outputs,
  };
}

module.exports = {
  processVoice,
  evaluateDifficulty,
};
