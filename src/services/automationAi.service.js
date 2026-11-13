'use strict';

const pool = require('../config/db');
const fetch = require('node-fetch');

/**
 * Get automation AI settings (singleton)
 * @returns {Promise<Object|null>}
 */
async function getSettings() {
  const res = await pool.query(
    'SELECT * FROM automation_ai_settings LIMIT 1'
  );
  return res.rows[0] || null;
}

/**
 * Get prompt template for specific item type
 * @param {string} item_type - 'request', 'announcement', or 'referral'
 * @returns {Promise<string|null>}
 */
async function getPromptTemplate(item_type) {
  const res = await pool.query(
    'SELECT prompt_template FROM automation_ai_prompts WHERE item_type=$1 AND is_active=TRUE LIMIT 1',
    [item_type]
  );
  return res.rows[0]?.prompt_template || null;
}

/**
 * Process automation transcript with AI formatting
 * @param {Object} params
 * @param {number} params.topic_id - Automation topic ID
 * @param {string} params.transcript_text - Raw transcript from STT
 * @param {string} params.item_type - 'request', 'announcement', or 'referral'
 * @returns {Promise<{formatted_text: string}>}
 */
async function processAutomationTranscript({ topic_id, transcript_text, item_type }) {
  // 1. Fetch topic details
  const topicRes = await pool.query(
    'SELECT title, draft_template FROM automation_topics WHERE id=$1 LIMIT 1',
    [topic_id]
  );
  
  if (!topicRes.rows.length) {
    const err = new Error('موضوع یافت نشد');
    err.code = 'TOPIC_NOT_FOUND';
    throw err;
  }
  
  const topic = topicRes.rows[0];

  // 2. Get AI settings
  const settings = await getSettings();
  if (!settings || !settings.enabled) {
    console.log('[AutomationAI] AI disabled or not configured - returning original text');
    return { formatted_text: transcript_text };
  }

  // 3. Get prompt template
  const template = await getPromptTemplate(item_type);
  if (!template) {
    console.log(`[AutomationAI] No prompt template found for type: ${item_type}`);
    return { formatted_text: transcript_text };
  }

  // 4. Build prompt from template with variable substitution
  const prompt = template
    .replace(/{topic_title}/g, topic.title || 'نامشخص')
    .replace(/{draft_template}/g, topic.draft_template || 'ندارد')
    .replace(/{transcript_text}/g, transcript_text);

  // 5. Call AI API
  try {
    const response = await callAI(settings, prompt);
    const formatted = response.trim();
    
    if (!formatted) {
      console.log('[AutomationAI] AI returned empty response - using original');
      return { formatted_text: transcript_text };
    }
    
    return { formatted_text: formatted };
  } catch (err) {
    console.error('[AutomationAI] AI call failed:', err.message);
    // Graceful fallback to original text
    return { formatted_text: transcript_text };
  }
}

/**
 * Call AI API with timeout and error handling
 * @private
 */
async function callAI(settings, prompt) {
  const { provider_type, base_url, api_key, model_name, max_tokens, temperature, timeout_seconds } = settings;
  
  if (!base_url) {
    throw new Error('base_url not configured');
  }

  const timeoutMs = (timeout_seconds || 30) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (api_key) {
      headers['Authorization'] = `Bearer ${api_key}`;
    }

    // Build request body
    const body = {
      prompt,
      max_tokens: max_tokens || 500,
      temperature: temperature || 0.7
    };

    if (model_name) {
      body.model = model_name;
    }

    // Special handling for Ollama format
    if (provider_type === 'local' && base_url.includes('ollama')) {
      body.stream = false;
    }

    const response = await fetch(base_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AI API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Try multiple possible response field names
    return data.text || data.response || data.output || data.result || data.content || data.completion || '';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('AI API timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Update automation AI settings (singleton upsert)
 * @param {Object} payload - Settings object
 * @returns {Promise<Object>}
 */
async function updateSettings(payload) {
  const res = await pool.query(`
    INSERT INTO automation_ai_settings (
      provider_type, base_url, api_key, model_name, 
      max_tokens, temperature, enabled, timeout_seconds
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT ((1)) DO UPDATE SET
      provider_type = EXCLUDED.provider_type,
      base_url = EXCLUDED.base_url,
      api_key = EXCLUDED.api_key,
      model_name = EXCLUDED.model_name,
      max_tokens = EXCLUDED.max_tokens,
      temperature = EXCLUDED.temperature,
      enabled = EXCLUDED.enabled,
      timeout_seconds = EXCLUDED.timeout_seconds,
      updated_at = NOW()
    RETURNING *
  `, [
    payload.provider_type || 'local',
    (payload.base_url || '').trim(),
    (payload.api_key || '').trim(),
    (payload.model_name || '').trim(),
    parseInt(payload.max_tokens, 10) || 500,
    parseFloat(payload.temperature) || 0.7,
    payload.enabled === true || payload.enabled === 'true',
    parseInt(payload.timeout_seconds, 10) || 30
  ]);
  return res.rows[0];
}

/**
 * Update prompt template for specific item type
 * @param {string} item_type
 * @param {string} prompt_template
 * @returns {Promise<Object>}
 */
async function updatePromptTemplate(item_type, prompt_template) {
  if (!['request', 'announcement', 'referral'].includes(item_type)) {
    throw new Error('Invalid item_type');
  }
  
  const res = await pool.query(`
    UPDATE automation_ai_prompts 
    SET prompt_template = $2, updated_at = NOW()
    WHERE item_type = $1
    RETURNING *
  `, [item_type, prompt_template]);
  
  if (!res.rows.length) {
    throw new Error('Prompt template not found');
  }
  
  return res.rows[0];
}

/**
 * Get all prompt templates
 * @returns {Promise<Array>}
 */
async function getAllPromptTemplates() {
  const res = await pool.query(
    'SELECT * FROM automation_ai_prompts ORDER BY item_type'
  );
  return res.rows;
}

module.exports = {
  getSettings,
  getPromptTemplate,
  processAutomationTranscript,
  updateSettings,
  updatePromptTemplate,
  getAllPromptTemplates
};
