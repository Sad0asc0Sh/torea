'use strict';

const express = require('express');
const router = express.Router();

const practiceCoach = require('../../../services/negotiation.practice_coach');
const customerIndustriesService = require('../../../services/customerIndustries.service');

const MAX_SAY_INSTEAD_SUGGESTIONS = 8;

function normalizeScenario(text) {
  return (text || '').toString().trim();
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadIndustries() {
  try {
    return (await customerIndustriesService.listActiveCustomerIndustries()) || [];
  } catch (err) {
    return [];
  }
}

router.get('/', async (req, res) => {
  const industries = await loadIndustries();
  res.render('admin/tools/negotiation_practice', {
    user: req.session?.user || null,
    error: null,
    result: null,
    scenario_text: '',
    customer_industry_id: '',
    industries,
  });
});

router.post(['/', '/run'], async (req, res) => {
  const user = req.session?.user || null;
  const industries = await loadIndustries();
  const scenario_text = normalizeScenario(req.body?.scenario_text);
  const customer_industry_id = toNumberOrNull(req.body?.customer_industry_id);

  if (!scenario_text) {
    return res.render('admin/tools/negotiation_practice', {
      user,
      error: 'سناریوی مذاکره را وارد کنید.',
      result: null,
      scenario_text: '',
      customer_industry_id: '',
      industries,
    });
  }

  let result = null;
  let error = null;

  try {
    const coached = await practiceCoach.coachTranscript({ transcript: scenario_text, userId: user?.id || null });
    result = {
      weak_points: coached?.weak_points || [],
      improved_sentences: coached?.better_sentences || [],
      say_instead: (coached?.improved_script_lines || []).slice(0, MAX_SAY_INSTEAD_SUGGESTIONS),
    };
  } catch (err) {
    console.error('Negotiation practice run error:', err?.message || err);
    error = 'خطای سیستم در تولید پیشنهاد. لطفاً متن را بازبینی کرده و دوباره تلاش کنید.';
  }

  return res.render('admin/tools/negotiation_practice', {
    user,
    error,
    result,
    scenario_text,
    customer_industry_id: customer_industry_id || '',
    industries,
  });
});

module.exports = router;
