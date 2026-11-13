# 📋 AUTOMATION MODULE - COMPLETE SPECIFICATION

این سند کامل‌ترین مرجع برای پیاده‌سازی **ماژول اتوماسیون اداری** در پروژه ToInfinity است.

---

## 🎯 1. نمای کلی (Overview)

### هدف:
سیستم اتوماسیون اداری برای مدیریت **درخواست‌ها (Request)**، **ابلاغ‌ها (Announcement)** و **ارجاعات (Referral)** بین کاربران در سلسله‌مراتب سازمانی با قابلیت:
- ضبط صوت و تبدیل به متن (STT)
- تحلیل و فرمت‌بندی متن با هوش مصنوعی
- مدیریت گردش کار و تایید/رد
- لاگ کامل برای پیگیری
- نوتیفیکیشن و یادآوری خودکار

---

## 🏗️ 2. معماری سیستم

### 2.1 سه نوع عملیات:

| نوع | جهت | فرستنده | گیرنده | انتخاب گیرنده | قوانین |
|-----|------|----------|---------|---------------|--------|
| **🔵 درخواست (Request)** | Bottom → Up | کاربر در سلسله‌مراتب | مدیر مستقیم (manager_id) | ❌ خودکار | فقط به یک نفر (مدیر بالادست) |
| **🟢 ابلاغ (Announcement)** | Top → Down | مدیر / SYSTEM_ADMIN | زیردستان / کل سازمان | ✅ org_node یا users | اگر انتخاب نشه → همه زیرشاخه‌ها بر اساس سلسله‌مراتب |
| **🟡 ارجاع (Referral)** | Horizontal | هر کاربر/مدیر | کاربران دیگر (cross-branch) | ✅ **حداقل یک کاربر الزامی** | چند انتخابی (multi-select) |

### 2.2 اقدامات پس از دریافت:

| دریافتی | اقدامات ممکن |
|---------|---------------|
| 🔵 **درخواست** | تایید / رد / ابلاغ به زیردستان / ارجاع به مدیر دیگر / درخواست جدید به بالاتر |
| 🟢 **ابلاغ** | تایید دریافت (Acknowledge) |
| 🟡 **ارجاع** | تایید / رد / ارجاع مجدد / ابلاغ / درخواست |

### 2.3 قوانین مهم:
- ✅ فقط کاربران فعال: `active = TRUE` و `status = 'active'`
- ✅ SYSTEM_ADMIN محدودیت ندارد، میتواند به همه ابلاغ/ارجاع کند
- ✅ ابلاغ بدون انتخاب → همه زیردستان بر اساس org_node
- ✅ ارجاع بدون انتخاب → خطا (حداقل یک نفر الزامی)
- ✅ یادآوری خودکار 48 ساعته برای pending items

---

## 🗄️ 3. ساختار دیتابیس

### 3.1 جداول موجود (نیاز به تغییر):

#### automation_topics (✅ موجود - OK)
```sql
CREATE TABLE IF NOT EXISTS public.automation_topics (
  id SERIAL PRIMARY KEY,
  title VARCHAR NOT NULL,
  is_for_request BOOLEAN DEFAULT false,
  is_for_referral BOOLEAN DEFAULT false,
  is_for_announcement BOOLEAN DEFAULT false,
  draft_template TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
```

#### automation_items (⚠️ نیاز به تغییر)
```sql
-- موجود - باید parent_item_id اضافه بشه
ALTER TABLE automation_items 
  ADD COLUMN IF NOT EXISTS parent_item_id INT REFERENCES automation_items(id);

CREATE INDEX IF NOT EXISTS idx_automation_items_parent ON automation_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_created_by ON automation_items(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_topic ON automation_items(topic_id);
```

#### automation_item_recipients (⚠️ نیاز به بهبود)
```sql
-- اضافه کردن status برای هر recipient
ALTER TABLE automation_item_recipients 
  ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'pending' 
  CHECK (status IN ('pending', 'read', 'approved', 'rejected', 'acknowledged'));

ALTER TABLE automation_item_recipients 
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_air_user_status ON automation_item_recipients(user_id, status);
```

### 3.2 جدول جدید: لاگ کامل

```sql
-- ✅ جدول جدید برای Audit Trail
CREATE TABLE IF NOT EXISTS public.automation_item_logs (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES automation_items(id) ON DELETE CASCADE,
  action_type VARCHAR NOT NULL CHECK (action_type IN (
    'created', 'sent', 'received', 'read',
    'approved', 'rejected', 'acknowledged',
    'forwarded_as_request', 'forwarded_as_referral', 'forwarded_as_announcement',
    'reminded_48h'
  )),
  action_by_user_id INT REFERENCES users(id),
  action_at TIMESTAMP DEFAULT NOW(),
  note TEXT,
  voice_path TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_item ON automation_item_logs(item_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_item_logs(action_by_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_type ON automation_item_logs(action_type);
```

### 3.3 View: Thread Hierarchy

```sql
CREATE OR REPLACE VIEW automation_item_threads AS
WITH RECURSIVE thread AS (
  SELECT 
    id, parent_item_id, item_type, topic_id, 
    created_by_user_id, created_at, status,
    0 AS depth,
    ARRAY[id] AS path
  FROM automation_items 
  WHERE parent_item_id IS NULL
  
  UNION ALL
  
  SELECT 
    ai.id, ai.parent_item_id, ai.item_type, ai.topic_id,
    ai.created_by_user_id, ai.created_at, ai.status,
    t.depth + 1,
    t.path || ai.id
  FROM automation_items ai
  JOIN thread t ON ai.parent_item_id = t.id
  WHERE t.depth < 10
)
SELECT * FROM thread ORDER BY path;
```

---

## 📁 4. Migration Script

**File: `migrations/010_automation_module_improvements.sql`**

```sql
-- Automation Module Improvements
-- اضافه کردن ستون‌های جدید و ایندکس‌ها برای ماژول اتوماسیون

BEGIN;

-- 1. اضافه کردن parent_item_id برای زنجیره‌ای کردن آیتم‌ها
ALTER TABLE automation_items 
  ADD COLUMN IF NOT EXISTS parent_item_id INT REFERENCES automation_items(id);

-- 2. بهبود جدول recipients - اضافه کردن status برای هر گیرنده
ALTER TABLE automation_item_recipients 
  ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'pending' 
  CHECK (status IN ('pending', 'read', 'approved', 'rejected', 'acknowledged'));

ALTER TABLE automation_item_recipients 
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMP NULL;

-- 3. ایجاد جدول logs برای پیگیری کامل
CREATE TABLE IF NOT EXISTS public.automation_item_logs (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES automation_items(id) ON DELETE CASCADE,
  action_type VARCHAR NOT NULL CHECK (action_type IN (
    'created', 'sent', 'received', 'read',
    'approved', 'rejected', 'acknowledged',
    'forwarded_as_request', 'forwarded_as_referral', 'forwarded_as_announcement',
    'reminded_48h'
  )),
  action_by_user_id INT REFERENCES users(id),
  action_at TIMESTAMP DEFAULT NOW(),
  note TEXT,
  voice_path TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ایندکس‌های بهینه‌ساز
CREATE INDEX IF NOT EXISTS idx_automation_items_parent ON automation_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_created_by ON automation_items(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_topic ON automation_items(topic_id);

CREATE INDEX IF NOT EXISTS idx_air_user_status ON automation_item_recipients(user_id, status);

CREATE INDEX IF NOT EXISTS idx_automation_logs_item ON automation_item_logs(item_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_item_logs(action_by_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_type ON automation_item_logs(action_type);

-- 5. View برای زنجیره thread
CREATE OR REPLACE VIEW automation_item_threads AS
WITH RECURSIVE thread AS (
  SELECT 
    id, parent_item_id, item_type, topic_id, 
    created_by_user_id, created_at, status,
    0 AS depth,
    ARRAY[id] AS path
  FROM automation_items 
  WHERE parent_item_id IS NULL
  
  UNION ALL
  
  SELECT 
    ai.id, ai.parent_item_id, ai.item_type, ai.topic_id,
    ai.created_by_user_id, ai.created_at, ai.status,
    t.depth + 1,
    t.path || ai.id
  FROM automation_items ai
  JOIN thread t ON ai.parent_item_id = t.id
  WHERE t.depth < 10
)
SELECT * FROM thread ORDER BY path;

COMMIT;
```

---

## 🐛 5. رفع باگ: Redirect اشتباه

### مشکل:
صفحات `/admin/tools/office-automation/*` redirect به `/login` میکنند به‌جای `/admin/login`.

### علت:
Middleware `requireSystemAdmin` فراخوانی نمیشود.

### راه‌حل 1: در فایل automation.routes.js

```javascript
// src/routes/admin/tools/automation.routes.js
// در ابتدای فایل اضافه کنید:

const { requireSystemAdmin } = require('../../../middlewares/systemAdmin');

// بعد از تعریف router و قبل از routes:
router.use(requireSystemAdmin);
```

### راه‌حل 2: در فایل tools/index.js

```javascript
// src/routes/admin/tools/index.js
// خط 264 را تغییر دهید:

// قبل:
router.use('/tools/office-automation', automationRoutes);

// بعد:
const { requireSystemAdmin } = require('../../middlewares/systemAdmin');
router.use('/tools/office-automation', requireSystemAdmin, automationRoutes);
```

---

## 🔐 6. قوانین دسترسی

### 6.1 Helper Functions

```javascript
// src/services/automation.service.js

function canSendAnnouncement(user) {
  if (user.role === 'SYSTEM_ADMIN') return true;
  // مدیران میتونن به زیردستان ابلاغ کنن
  return user.manager_id !== null;
}

function canSendRequest(user) {
  // فقط اگر مدیر بالادست داشته باشه
  return user.manager_id !== null;
}

function canSendReferral(user) {
  // همه میتونن ارجاع بدن
  return true;
}
```

### 6.2 فیلتر کاربران فعال

```javascript
// فقط کاربران active و approved
async function fetchActiveUsers() {
  const res = await pool.query(`
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
      u.username,
      u.org_node_id,
      o.title AS org_node_title
    FROM users u
    LEFT JOIN org_nodes o ON o.id = u.org_node_id
    WHERE u.active = TRUE 
      AND u.status = 'active'
    ORDER BY full_name NULLS LAST, username ASC
  `);
  return res.rows || [];
}
```

---

## 🤖 7. دستیار صوتی (Voice Assistant)

### 7.1 Service: AI Formatting

**File: `src/services/automationAi.service.js`**

```javascript
'use strict';

const pool = require('../config/db');
const aiSettingsGateway = require('./aiSettingsGateway');

async function processAutomationTranscript({ topic_id, transcript_text, item_type }) {
  // 1. گرفتن topic
  const topicRes = await pool.query(
    'SELECT title, draft_template FROM automation_topics WHERE id=$1 LIMIT 1',
    [topic_id]
  );
  
  if (!topicRes.rows.length) {
    throw new Error('TOPIC_NOT_FOUND');
  }
  
  const topic = topicRes.rows[0];

  // 2. ساختن prompt
  const typeLabel = item_type === 'request' ? 'درخواست' : 
                     item_type === 'announcement' ? 'ابلاغ' : 'ارجاع';
  
  const prompt = `تو یک دستیار هوشمند اداری هستی.

موضوع: ${topic.title}
نوع سند: ${typeLabel}
قالب پیشنهادی: ${topic.draft_template || 'ندارد'}

متن گفتار کاربر:
"${transcript_text}"

لطفاً این متن را به‌صورت رسمی و مناسب برای یک ${typeLabel} اداری بازنویسی کن.
فقط متن نهایی را برگردان، بدون توضیح اضافه.`;

  // 3. فرستادن به AI
  try {
    const resolved = await aiSettingsGateway.resolve('automation', 'simple');
    
    if (!resolved || !resolved.enabled) {
      // اگر AI فعال نیست، همون متن original رو برگردون
      return { formatted_text: transcript_text };
    }

    const response = await callAI(resolved, prompt);
    return { formatted_text: response.trim() };
  } catch (err) {
    console.error('AI formatting failed:', err);
    return { formatted_text: transcript_text };
  }
}

async function callAI(config, prompt) {
  const { provider_type, base_url, api_key } = config;
  
  if (provider_type === 'local' || provider_type === 'hybrid') {
    const fetch = require('node-fetch');
    const response = await fetch(base_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(api_key && { 'Authorization': `Bearer ${api_key}` })
      },
      body: JSON.stringify({ prompt, max_tokens: 500 })
    });
    
    const data = await response.json();
    return data.text || data.response || data.output || '';
  }
  
  throw new Error('PROVIDER_NOT_SUPPORTED');
}

module.exports = { processAutomationTranscript };
```

### 7.2 Route: AI Format

در فایل `src/routes/admin/tools/automation.routes.js` اضافه کنید:

```javascript
const automationAi = require('../../../services/automationAi.service');

router.post('/ai/format', async (req, res) => {
  const topic_id = toInt(req.body.topic_id);
  const transcript_text = trimText(req.body.transcript_text);
  const item_type = (req.body.item_type || 'request').toString().trim();
  
  if (!topic_id || !transcript_text) {
    return res.status(400).json({ 
      ok: false, 
      error: 'topic_id و transcript_text الزامی است' 
    });
  }

  try {
    const result = await automationAi.processAutomationTranscript({ 
      topic_id, 
      transcript_text, 
      item_type 
    });
    
    return res.json({ ok: true, formatted_text: result.formatted_text });
  } catch (err) {
    console.error('POST /ai/format error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message || 'AI_FAILED' 
    });
  }
});
```

### 7.3 Frontend: Voice Handler

**File: `src/public/js/automation/voice-handler.js`**

```javascript
// Voice Recording Handler
class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.tempPath = null;
  }

  async startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      await this.uploadTempVoice(audioBlob);
    };

    this.mediaRecorder.start();
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      document.getElementById('recordBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      document.getElementById('transcribeBtn').disabled = false;
    }
  }

  async uploadTempVoice(blob) {
    const formData = new FormData();
    formData.append('voice', blob, 'recording.webm');

    const response = await fetch('/admin/tools/media/voice-temp-upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (data.ok) {
      this.tempPath = data.temp_path;
      console.log('Voice uploaded:', this.tempPath);
    } else {
      alert('آپلود صدا ناموفق بود: ' + data.message);
    }
  }

  async transcribe(modelKey) {
    if (!this.tempPath) {
      alert('ابتدا صدا را ضبط کنید');
      return null;
    }

    const response = await fetch('/admin/ai/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        temp_path: this.tempPath,
        model_key: modelKey || ''
      })
    });

    const data = await response.json();
    if (data.ok) {
      document.getElementById('transcript_text').value = data.text;
      document.getElementById('body_text').value = data.text;
      document.getElementById('formatBtn').disabled = false;
      return data.text;
    } else {
      alert('تبدیل به متن ناموفق بود: ' + data.message);
      return null;
    }
  }
}

const voiceRecorder = new VoiceRecorder();

document.getElementById('recordBtn')?.addEventListener('click', () => voiceRecorder.startRecording());
document.getElementById('stopBtn')?.addEventListener('click', () => voiceRecorder.stopRecording());
document.getElementById('transcribeBtn')?.addEventListener('click', async () => {
  const modelKey = document.getElementById('stt_model_key')?.value || '';
  await voiceRecorder.transcribe(modelKey);
});
```

### 7.4 Frontend: AI Formatter

**File: `src/public/js/automation/ai-formatter.js`**

```javascript
async function formatWithAI() {
  const topicId = document.getElementById('topic_id').value;
  const transcript = document.getElementById('transcript_text').value || 
                      document.getElementById('body_text').value;
  const itemType = document.querySelector('input[name="item_type"]')?.value || 'request';
  
  if (!transcript) {
    alert('ابتدا متن را ضبط یا وارد کنید');
    return;
  }

  if (!topicId) {
    alert('ابتدا موضوع را انتخاب کنید');
    return;
  }

  try {
    const response = await fetch('/admin/tools/office-automation/ai/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        topic_id: topicId, 
        transcript_text: transcript,
        item_type: itemType
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      document.getElementById('body_text').value = data.formatted_text;
      alert('✅ متن با موفقیت فرمت شد');
    } else {
      alert('❌ فرمت با AI انجام نشد: ' + data.error);
    }
  } catch (err) {
    alert('خطا در ارتباط با سرور: ' + err.message);
  }
}

document.getElementById('formatBtn')?.addEventListener('click', formatWithAI);
```

---

## ⏰ 8. یادآوری خودکار 48 ساعته

**File: `src/jobs/automationReminder.job.js`**

```javascript
'use strict';

const pool = require('../config/db');
const systemAdminService = require('../services/systemAdmin.service');

async function checkAndSendReminders() {
  console.log('[AutomationReminder] Starting check...');

  try {
    // پیدا کردن آیتم‌هایی که 48 ساعت گذشته و هنوز pending هستن
    const items = await pool.query(`
      SELECT 
        ai.id,
        ai.item_type,
        ai.body_text,
        at.title AS topic_title,
        air.user_id,
        u.telegram_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
        ai.created_at
      FROM automation_items ai
      JOIN automation_item_recipients air ON air.item_id = ai.id
      JOIN users u ON u.id = air.user_id
      LEFT JOIN automation_topics at ON at.id = ai.topic_id
      WHERE air.status = 'pending'
        AND ai.created_at < NOW() - INTERVAL '48 hours'
        AND NOT EXISTS (
          SELECT 1 FROM automation_item_logs 
          WHERE item_id = ai.id 
            AND action_type = 'reminded_48h'
            AND action_at > NOW() - INTERVAL '24 hours'
        )
      LIMIT 100
    `);

    const token = await systemAdminService.getTelegramBotToken();

    for (const item of items.rows || []) {
      try {
        // ارسال پیام تلگرام
        if (item.telegram_id && token) {
          const message = `⏰ یادآوری: شما یک ${item.item_type} در انتظار دارید.\n\nموضوع: ${item.topic_title}\nمتن: ${item.body_text}\n\nلطفاً به آن رسیدگی کنید.`;
          await systemAdminService.sendTelegramMessage(token, item.telegram_id, message);
        }

        // ثبت لاگ
        await pool.query(`
          INSERT INTO automation_item_logs (item_id, action_type, action_by_user_id, note)
          VALUES ($1, 'reminded_48h', NULL, 'Automatic 48h reminder sent')
        `, [item.id]);

        console.log(`[AutomationReminder] Sent to user ${item.user_id} for item ${item.id}`);
      } catch (err) {
        console.error(`[AutomationReminder] Failed for item ${item.id}:`, err);
      }
    }

    console.log(`[AutomationReminder] Completed. Sent ${items.rows.length} reminders.`);
  } catch (err) {
    console.error('[AutomationReminder] Error:', err);
  }
}

// اجرای هر ساعت
setInterval(checkAndSendReminders, 60 * 60 * 1000);

module.exports = { checkAndSendReminders };
```

**در `src/app.js` اضافه کنید:**

```javascript
// در انتهای فایل
if (process.env.NODE_ENV !== 'test') {
  require('./jobs/automationReminder.job');
}
```

---

## ✅ 9. Checklist پیاده‌سازی

### Database
- [ ] اجرای migration `010_automation_module_improvements.sql`
- [ ] تست جداول و ایندکس‌ها
- [ ] تست view `automation_item_threads`

### Backend - Bug Fix
- [ ] Fix redirect bug (add requireSystemAdmin middleware)

### Backend - Services
- [ ] ساخت `src/services/automationAi.service.js`
- [ ] بروزرسانی `fetchActiveUsers` با فیلتر active users

### Backend - Routes
- [ ] اضافه کردن route `/ai/format` در automation.routes.js
- [ ] اضافه کردن route `/inbox`
- [ ] اضافه کردن route `/outbox`
- [ ] اضافه کردن action routes (approve/reject/acknowledge)

### Frontend - JavaScript
- [ ] ساخت `src/public/js/automation/voice-handler.js`
- [ ] ساخت `src/public/js/automation/ai-formatter.js`

### Jobs
- [ ] ساخت `src/jobs/automationReminder.job.js`
- [ ] اضافه کردن به `app.js`

### Documentation
- [ ] بروزرسانی `docs/ARCHITECTURE_CURRENT.md`
- [ ] بروزرسانی `docs/DB_MAP.md`
- [ ] بروزرسانی `README.md`

### Testing
- [ ] تست manual: ساخت request/announcement/referral
- [ ] تست: voice recording + STT + AI formatting
- [ ] تست: 48h reminder job

---

## 🎯 10. نکات مهم

1. **Migration اول**: همیشه اول migration رو اجرا کن
2. **فیلتر Active Users**: همه‌جا فقط `active=true` و `status='active'`
3. **Middleware**: حتماً `requireSystemAdmin` رو اضافه کن
4. **Error Handling**: همه‌جا try-catch
5. **Logging**: همه اقدامات رو در `automation_item_logs` ثبت کن
6. **AI Fallback**: اگر AI fail کرد، متن original رو برگردون
7. **Telegram Optional**: اگر token نبود، skip کن نه error
8. **48h Check**: cron job نباید duplicate reminder بفرسته
9. **Parent Item**: وقتی پاسخ میدی، `parent_item_id` رو ست کن
10. **Voice Safety**: فایل‌های صوتی رو validate کن

---

**این سند آماده است برای استفاده توسط Coding Agent.**

---

## 📌 Document Metadata

- **Created**: 2025-12-27
- **Author**: smkhadivpoor
- **Version**: 1.0
- **Status**: Complete Specification
- **Purpose**: Complete implementation guide for Office Automation Module in ToInfinity project
