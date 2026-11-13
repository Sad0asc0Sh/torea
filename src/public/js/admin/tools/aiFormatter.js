/**
 * AI Formatter for Automation Transcript Text
 * Sends transcript to AI endpoint for formatting
 */

class AIFormatter {
  constructor(options = {}) {
    this.formatUrl = options.formatUrl || '/admin/tools/office-automation/ai/format';
    this.onFormatStart = options.onFormatStart || (() => {});
    this.onFormatSuccess = options.onFormatSuccess || (() => {});
    this.onFormatError = options.onFormatError || ((err) => console.error(err));
  }

  /**
   * Format transcript text using AI
   * @param {Object} params
   * @param {number} params.topic_id - Topic ID
   * @param {string} params.transcript_text - Raw transcript
   * @param {string} params.item_type - 'request', 'announcement', or 'referral'
   * @returns {Promise<string>} Formatted text
   */
  async format({ topic_id, transcript_text, item_type }) {
    // Validation
    if (!topic_id || isNaN(parseInt(topic_id, 10))) {
      const error = new Error('موضوع انتخاب نشده است');
      this.onFormatError(error);
      throw error;
    }

    if (!transcript_text || transcript_text.trim().length === 0) {
      const error = new Error('متن برای فرمت کردن وجود ندارد');
      this.onFormatError(error);
      throw error;
    }

    if (!['request', 'announcement', 'referral'].includes(item_type)) {
      const error = new Error('نوع سند نامعتبر است');
      this.onFormatError(error);
      throw error;
    }

    this.onFormatStart();

    try {
      const response = await fetch(this.formatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic_id: parseInt(topic_id, 10),
          transcript_text: transcript_text.trim(),
          item_type: item_type
        })
      });

      if (!response.ok) {
        // Try to parse JSON error response if available
        let errorMessage = 'خطای سرور در پردازش درخواست';
        if (response.status >= 400 && response.status < 500) {
          errorMessage = 'خطا در ارسال درخواست';
        }
        try {
          const result = await response.json();
          errorMessage = result.message || errorMessage;
        } catch {
          // Ignore JSON parse errors for non-JSON responses
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.ok && result.formatted_text) {
        this.onFormatSuccess(result.formatted_text);
        return result.formatted_text;
      } else {
        throw new Error(result.message || 'خطا در فرمت کردن متن');
      }
    } catch (err) {
      console.error('AI Format error:', err);
      this.onFormatError(err);
      throw err;
    }
  }

  /**
   * Check if AI is available (optional ping)
   */
  async checkAvailability() {
    try {
      const response = await fetch(this.formatUrl, {
        method: 'HEAD'
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIFormatter;
}
