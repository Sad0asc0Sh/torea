const test = require('node:test');
const assert = require('node:assert/strict');

const coach = require('../../../src/services/negotiation.practice_coach');

test('coachTranscript returns concise coaching suggestions', async () => {
  const transcript = 'سلام، شاید بتونیم همکاری کنیم اما مطمئن نیستم. فکر می‌کنم محصول شما خوب است.';
  const result = await coach.coachTranscript({ transcript });

  assert.ok(Array.isArray(result.weak_points), 'weak points should be an array');
  assert.ok(Array.isArray(result.better_sentences), 'better sentences should be an array');
  assert.ok(Array.isArray(result.improved_script_lines), 'improved script lines should be an array');

  assert.ok(result.better_sentences.length > 0, 'should suggest improved sentences');
  assert.ok(result.improved_script_lines.length > 0, 'should offer say-instead examples');
});
