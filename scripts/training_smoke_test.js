/* Minimal smoke test for training.engine (run with: node scripts/training_smoke_test.js) */
const { processVoice } = require('../src/services/training.engine');

const topics = [
  { topic_key: 'greeting', title: 'خوشامدگویی', order_index: 1, is_enabled: true, provider_mode: 'hybrid' },
  { topic_key: 'offer', title: 'پیشنهاد', order_index: 2, is_enabled: true, provider_mode: 'hybrid' },
];

const settings = {
  baseline_voices_count: 2,
  rolling_window_n: 2,
  threshold_score: 70,
};

const stateStore = new Map();
const scores = [];

const mockRepo = {
  async getCompanyTrainingSettings() {
    return { ...settings };
  },
  async getEnabledTopicsOrdered() {
    return topics;
  },
  async getUserTrainingState(userId) {
    return stateStore.get(userId) || null;
  },
  async upsertUserTrainingState(userId, state) {
    stateStore.set(userId, { ...state, user_id: userId });
    return stateStore.get(userId);
  },
  async insertTrainingScore({ userId, topicKey, score, voiceLogId = null }) {
    const row = { id: scores.length + 1, user_id: userId, topic_key: topicKey, score, voice_log_id: voiceLogId };
    scores.push(row);
    return row;
  },
  async getRollingAverage(userId, topicKey, n) {
    const limit = Number.isFinite(Number(n)) && n > 0 ? Number(n) : settings.rolling_window_n;
    const recent = scores
      .filter((s) => s.user_id === userId && s.topic_key === topicKey)
      .slice(-limit)
      .map((s) => s.score);
    if (!recent.length) return null;
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  },
  async getAllTopicsStatusForUser(userId, n, threshold) {
    const limit = Number.isFinite(Number(n)) && n > 0 ? Number(n) : settings.rolling_window_n;
    const th = Number.isFinite(Number(threshold)) ? Number(threshold) : settings.threshold_score;
    return topics.map((t) => {
      const recent = scores
        .filter((s) => s.user_id === userId && s.topic_key === t.topic_key)
        .slice(-limit)
        .map((s) => s.score);
      const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
      return { topic_key: t.topic_key, rolling_avg: avg, met_threshold: avg !== null && avg >= th };
    });
  },
};

async function run() {
  const userId = '00000000-0000-0000-0000-000000000001';
  console.log('--- Baseline 1 ---');
  console.log(await processVoice({ userId, transcript: 'سلام وقت بخیر', meta: { tool: 'training' } }, { repo: mockRepo }));

  console.log('--- Baseline 2 (completes baseline) ---');
  console.log(await processVoice({ userId, transcript: 'امروز درباره محصول صحبت می‌کنم', meta: { tool: 'training' } }, { repo: mockRepo }));

  console.log('--- Training on first topic ---');
  console.log(
    await processVoice(
      {
        userId,
        transcript:
          'در این مکالمه معرفی کوتاهی انجام می‌دهم و سپس نیاز مشتری را می‌پرسم تا پیشنهاد مناسب ارائه کنم. جزئیات را شفاف توضیح می‌دهم و مسیر تصمیم گیری او را با مثال روشن می‌کنم. چند سناریو احتمالی را مرور می‌کنم تا نشان دهم چگونه محصول ما برای نیازهای مختلف به کار می‌آید و راه حل سریع ارائه می‌دهد. در پایان جمع بندی می‌کنم و اقدام بعدی را تعیین می‌کنم تا تعامل منسجم بماند.',
        meta: { tool: 'training' },
      },
      { repo: mockRepo }
    )
  );

  console.log('--- Training second hit (potentially unlock next topic) ---');
  console.log(
    await processVoice(
      {
        userId,
        transcript:
          'اکنون مزایای محصول را با مثال بیان می‌کنم و به نگرانی‌های احتمالی پاسخ می‌دهم تا تصمیم آگاهانه بگیرد. درباره قیمت، گارانتی، خدمات پس از فروش، زمان تحویل و شرایط پرداخت توضیح می‌دهم و هر بند را خلاصه می‌کنم تا ابهامی نماند. اگر مشتری تردید داشت، نمونه واقعی و تجربه دیگران را بیان می‌کنم.',
        meta: { tool: 'training' },
      },
      { repo: mockRepo }
    )
  );

  console.log('--- Training after unlock (should move to next topic or level-up) ---');
  console.log(
    await processVoice(
      {
        userId,
        transcript:
          'در مورد پیشنهاد ویژه توضیح کامل می‌دهم، شرایط را شفاف می‌کنم و پیگیری پس از تماس را تعهد می‌دهم تا رضایت مشتری جلب شود. روی ارزش نهایی تاکید می‌کنم، زمان‌بندی تحویل را به‌روز می‌کنم و خلاصه ۲۵ کلمه‌ای را برای مدیر می‌فرستم تا روند بررسی سریع شود. سه نکته کلیدی را هم تکرار می‌کنم تا به خاطر سپرده شود.',
        meta: { tool: 'training' },
      },
      { repo: mockRepo }
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
