/**
 * Voice Recording Handler for Automation Module
 * Handles recording, upload, and cleanup of voice files
 */

class VoiceHandler {
  constructor(options = {}) {
    this.uploadUrl = options.uploadUrl || '/admin/tools/media/voice-upload';
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingStartTime = null;
    this.isRecording = false;
    this.onRecordingStart = options.onRecordingStart || (() => {});
    this.onRecordingStop = options.onRecordingStop || (() => {});
    this.onUploadSuccess = options.onUploadSuccess || (() => {});
    this.onError = options.onError || ((err) => console.error(err));
  }

  /**
   * Check if browser supports MediaRecorder
   */
  isSupported() {
    return !!(
      navigator.mediaDevices && 
      navigator.mediaDevices.getUserMedia && 
      window.MediaRecorder &&
      typeof MediaRecorder.isTypeSupported === 'function'
    );
  }

  /**
   * Start recording
   */
  async startRecording() {
    if (!this.isSupported()) {
      this.onError(new Error('مرورگر شما از ضبط صدا پشتیبانی نمیکند'));
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Prefer webm/opus, fallback to other formats
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined
      });

      this.audioChunks = [];
      this.recordingStartTime = Date.now();

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder.mimeType || 'audio/webm' 
        });
        const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        
        this.onRecordingStop({ blob: audioBlob, duration });
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.onRecordingStart();
      
      return true;
    } catch (err) {
      console.error('Recording error:', err);
      this.onError(new Error('خطا در دسترسی به میکروفون. لطفاً دسترسی را مجاز کنید.'));
      return false;
    }
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      return true;
    }
    return false;
  }

  /**
   * Upload recorded audio to server
   */
  async uploadAudio(audioBlob) {
    const formData = new FormData();
    // Use dynamic filename based on blob type or fallback to generic name
    const extension = audioBlob.type.includes('webm') ? 'webm' : 
                     audioBlob.type.includes('mp4') ? 'mp4' : 
                     audioBlob.type.includes('ogg') ? 'ogg' : 'audio';
    formData.append('voice', audioBlob, `recording.${extension}`);

    try {
      const response = await fetch(this.uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('خطا در آپلود فایل صوتی به سرور');
      }

      let result;
      try {
        result = await response.json();
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr);
        throw new Error('خطا در پردازش پاسخ سرور');
      }
      
      if (result.ok) {
        this.onUploadSuccess(result);
        return result;
      } else {
        throw new Error(result.message || 'خطا در آپلود فایل صوتی');
      }
    } catch (err) {
      console.error('Upload error:', err);
      this.onError(new Error('خطا در آپلود فایل صوتی'));
      throw err;
    }
  }

  /**
   * Complete workflow: record and upload
   */
  async recordAndUpload() {
    return new Promise((resolve, reject) => {
      // Save original callback to restore it after upload
      const originalOnRecordingStop = this.onRecordingStop;

      this.onRecordingStop = async ({ blob, duration }) => {
        try {
          // Call original callback if it exists
          if (originalOnRecordingStop) {
            originalOnRecordingStop({ blob, duration });
          }
          
          const result = await this.uploadAudio(blob);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          // Restore original callback
          this.onRecordingStop = originalOnRecordingStop;
        }
      };

      this.startRecording()
        .then(started => {
          if (!started) {
            reject(new Error('شروع ضبط صدا ناموفق بود'));
          }
        })
        .catch(reject);
    });
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoiceHandler;
}
