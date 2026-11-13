'use strict';

/**
 * Negotiation Practice Coach Service
 * 
 * This service provides coaching for negotiation practice by analyzing transcripts
 * and suggesting better phrasing and improved scripts.
 * 
 * IMPORTANT: This is NOT integrated with Training Engine.
 * No summary_25, no key_points, no scoring, no training progression.
 * 
 * Note: Currently uses template-based logic. Future enhancement could integrate AI.
 */

// Fallback templates when AI is not available
const FALLBACK_WEAK_POINTS = [
  'استفاده از کلمات ضعیف یا تردید',
  'عدم ارائه مثال مشخص',
  'نبود اعتماد به نفس در بیان'
];

const FALLBACK_BETTER_SENTENCES = [
  'به جای "شاید" از "قطعا" استفاده کنید',
  'به جای "من فکر می‌کنم" بگویید "من مطمئن هستم"',
  'به جای "ممکن است" بگویید "قادر هستم"',
  'از جملات مثبت و قاطع استفاده کنید',
  'به جای پرسیدن، اطمینان بدهید'
];

const FALLBACK_SCRIPT_LINES = [
  'سلام، من [نام شما] از تیم فروش هستم.',
  'می‌خواهم محصول ما را معرفی کنم که برای شما مناسب است.',
  'این محصول ویژگی‌های منحصر به فردی دارد که نیاز شما را برطرف می‌کند.',
  'قیمت آن رقابتی است و ارزش افزوده بالایی دارد.',
  'می‌توانیم امروز قرارداد را نهایی کنیم.',
  'چه زمانی برای شما مناسب است تا جزئیات را بررسی کنیم؟'
];

/**
 * Extract weak points from transcript
 * @param {string} transcript - The negotiation transcript
 * @returns {string[]} - Array of weak points (max 3)
 */
function extractWeakPoints(transcript) {
  const weakPoints = [];
  const text = (transcript || '').toLowerCase();
  
  // Check for weak language patterns
  if (text.includes('شاید') || text.includes('احتمال')) {
    weakPoints.push('استفاده از کلمات تردید مانند "شاید" یا "احتمال"');
  }
  
  if (text.includes('نمی‌دانم') || text.includes('مطمئن نیستم')) {
    weakPoints.push('ابراز عدم اطمینان در مکالمه');
  }
  
  if (text.length < 50) {
    weakPoints.push('طول مکالمه کوتاه است و جزئیات کافی ندارد');
  }
  
  // Return max 3 weak points
  if (weakPoints.length === 0) {
    return FALLBACK_WEAK_POINTS.slice(0, 3);
  }
  
  return weakPoints.slice(0, 3);
}

/**
 * Generate better sentence suggestions
 * @param {string} transcript - The negotiation transcript
 * @returns {string[]} - Array of better sentences (3-7 items)
 */
function generateBetterSentences(transcript) {
  const suggestions = [];
  const text = (transcript || '').toLowerCase();
  
  // Analyze and provide specific suggestions
  if (text.includes('شاید')) {
    suggestions.push('به جای "شاید" از "مطمئنا" یا "قطعا" استفاده کنید');
  }
  
  if (text.includes('نمی‌دانم')) {
    suggestions.push('به جای "نمی‌دانم" بگویید "اجازه دهید بررسی کنم و اطلاعات دقیق را به شما بدهم"');
  }
  
  if (text.includes('ممکن است')) {
    suggestions.push('به جای "ممکن است" بگویید "می‌توانیم" یا "قادر هستیم"');
  }
  
  // Always add some general suggestions
  suggestions.push('از جملات فعال و مثبت استفاده کنید');
  suggestions.push('تاکید بر مزایای محصول و نه ویژگی‌ها');
  suggestions.push('پرسش‌های باز بپرسید تا مشتری بیشتر صحبت کند');
  suggestions.push('با اعتماد به نفس و لحن دوستانه صحبت کنید');
  
  // Return 3-7 items
  return suggestions.slice(0, 7);
}

/**
 * Generate improved script lines
 * @param {string} transcript - The negotiation transcript
 * @returns {string[]} - Array of improved script lines (6-10 lines)
 */
function generateImprovedScript(transcript) {
  const scriptLines = [];
  
  // Opening
  scriptLines.push('سلام، من [نام شما] از [نام شرکت] هستم.');
  scriptLines.push('می‌خواهم درباره راه‌حلی صحبت کنم که برای کسب‌وکار شما مفید است.');
  
  // Value proposition
  scriptLines.push('محصول ما ویژگی‌های منحصر به فردی دارد که نیاز شما را برطرف می‌کند.');
  scriptLines.push('قیمت آن رقابتی است و بازگشت سرمایه سریعی دارد.');
  
  // Questions
  scriptLines.push('می‌توانم بپرسم چه چالش‌هایی در حال حاضر دارید؟');
  scriptLines.push('چه ویژگی‌هایی برای شما در اولویت است؟');
  
  // Closing
  scriptLines.push('پیشنهاد می‌کنم امروز جلسه‌ای تنظیم کنیم تا جزئیات را بررسی کنیم.');
  scriptLines.push('چه زمانی برای شما مناسب است؟');
  
  // Return 6-10 lines
  return scriptLines.slice(0, 10);
}

/**
 * Coach a negotiation transcript
 * 
 * @param {Object} params
 * @param {string} params.transcript - The negotiation transcript to analyze
 * @param {string} params.userId - User ID (optional, for future AI integration)
 * @returns {Promise<Object>} - Coaching results with weak_points, better_sentences, improved_script_lines
 */
async function coachTranscript({ transcript, userId }) {
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    throw new Error('Transcript is required and must be a non-empty string');
  }
  
  const cleanTranscript = transcript.trim();
  
  // Template-based coaching logic
  // Future enhancement: integrate AI for more sophisticated analysis
  const weak_points = extractWeakPoints(cleanTranscript);
  const better_sentences = generateBetterSentences(cleanTranscript);
  const improved_script_lines = generateImprovedScript(cleanTranscript);
  
  return {
    weak_points: weak_points.slice(0, 3),
    better_sentences: better_sentences.slice(0, 7),
    improved_script_lines: improved_script_lines.slice(0, 10)
  };
}

module.exports = {
  coachTranscript
};
