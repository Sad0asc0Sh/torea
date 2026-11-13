/**
 * Helper script to integrate voice recording and AI formatting
 * into automation forms (request/announcement/referral)
 * 
 * Usage:
 * Include this script in automation form pages and call:
 * initAutomationForm({ item_type: 'request', topicSelectId: 'topic_id', textareaId: 'body_text' })
 */

function initAutomationForm(config) {
  const {
    item_type,           // 'request', 'announcement', 'referral'
    topicSelectId,       // ID of topic dropdown
    textareaId,          // ID of body text textarea
    recordButtonId,      // ID of record button (optional)
    formatButtonId,      // ID of format button (optional)
    statusElementId      // ID of status message element (optional)
  } = config;

  const topicSelect = document.getElementById(topicSelectId);
  const textarea = document.getElementById(textareaId);
  const recordButton = recordButtonId ? document.getElementById(recordButtonId) : null;
  const formatButton = formatButtonId ? document.getElementById(formatButtonId) : null;
  const statusElement = statusElementId ? document.getElementById(statusElementId) : null;

  if (!topicSelect || !textarea) {
    console.error('Required form elements not found');
    return;
  }

  // Check if required classes are available
  if (typeof VoiceHandler === 'undefined') {
    console.error('VoiceHandler class not found. Please ensure voiceHandler.js is loaded.');
    return;
  }

  if (typeof AIFormatter === 'undefined') {
    console.error('AIFormatter class not found. Please ensure aiFormatter.js is loaded.');
    return;
  }

  // Initialize handlers
  const voiceHandler = new VoiceHandler({
    onRecordingStart: () => {
      showStatus('در حال ضبط...', 'info');
      if (recordButton) {
        recordButton.textContent = 'توقف ضبط';
        recordButton.classList.add('recording');
      }
    },
    onRecordingStop: () => {
      showStatus('ضبط متوقف شد', 'success');
      if (recordButton) {
        recordButton.textContent = 'شروع ضبط';
        recordButton.classList.remove('recording');
      }
    },
    onUploadSuccess: (result) => {
      showStatus('فایل صوتی آپلود شد', 'success');
      // Store voice_path in hidden input if exists
      const voicePathInput = document.querySelector('input[name="voice_path"]');
      if (voicePathInput && result.voice_path) {
        voicePathInput.value = result.voice_path;
      }
    },
    onError: (err) => {
      showStatus(err.message, 'error');
    }
  });

  const aiFormatter = new AIFormatter({
    onFormatStart: () => {
      showStatus('در حال فرمت کردن با هوش مصنوعی...', 'info');
      if (formatButton) {
        formatButton.disabled = true;
        formatButton.textContent = 'در حال پردازش...';
      }
    },
    onFormatSuccess: (formatted_text) => {
      textarea.value = formatted_text;
      showStatus('متن با موفقیت فرمت شد', 'success');
      if (formatButton) {
        formatButton.disabled = false;
        formatButton.textContent = 'فرمت کردن با AI';
      }
    },
    onFormatError: (err) => {
      showStatus(err.message, 'error');
      if (formatButton) {
        formatButton.disabled = false;
        formatButton.textContent = 'فرمت کردن با AI';
      }
    }
  });

  // Attach event listeners
  if (recordButton) {
    recordButton.addEventListener('click', async () => {
      if (voiceHandler.isRecording) {
        voiceHandler.stopRecording();
      } else {
        try {
          await voiceHandler.startRecording();
        } catch (err) {
          // Error is already handled by voiceHandler.onError callback
          console.error('Recording start error:', err);
        }
      }
    });
  }

  if (formatButton) {
    formatButton.addEventListener('click', async () => {
      const topic_id = topicSelect.value;
      const transcript_text = textarea.value;

      if (!topic_id) {
        showStatus('لطفاً موضوع را انتخاب کنید', 'error');
        return;
      }

      if (!transcript_text || transcript_text.trim().length === 0) {
        showStatus('لطفاً متنی برای فرمت کردن وارد کنید', 'error');
        return;
      }

      try {
        await aiFormatter.format({
          topic_id: parseInt(topic_id, 10),
          transcript_text,
          item_type
        });
      } catch (err) {
        // Error already handled by aiFormatter
      }
    });
  }

  // Helper function to show status messages
  function showStatus(message, type = 'info') {
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `status-message status-${type}`;
      statusElement.style.display = 'block';

      if (type === 'success') {
        setTimeout(() => {
          statusElement.style.display = 'none';
        }, 3000);
      }
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  return {
    voiceHandler,
    aiFormatter
  };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initAutomationForm };
}
