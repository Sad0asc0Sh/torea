# 📡 TRAINING MODULE - API ENDPOINTS

این سند شامل **مستندات کامل API** ماژول آموزش است.

---

## 📑 فهرست Endpoints

### Admin Routes (`/admin/tools/*`):
1. ✅ `GET /admin/tools/training` - صفحه اصلی Training
2. ✅ `POST /admin/tools/training/record` - ضبط و ثبت تمرین
3. ✅ `GET /admin/tools/negotiation-analysis` - صفحه تحلیل مذاکره
4. ✅ `POST /admin/tools/negotiation-analysis/submit` - ثبت تحلیل مذاکره
5. ✅ `GET /admin/tools/practice` - تمرین متنی
6. ✅ `POST /admin/tools/practice/run` - اجرای تمرین متنی

### Admin Settings (`/admin/settings/*`):
7. ✅ `GET /admin/settings/training-config` - تنظیمات Training
8. ✅ `POST /admin/settings/training-config/save` - ذخیره تنظیمات
9. ✅ `GET /admin/settings/training-topics` - مدیریت موضوعات
10. ✅ `POST /admin/settings/training-topics/create` - ایجاد موضوع
11. ✅ `POST /admin/settings/training-topics/:id/update` - ویرایش موضوع
12. ✅ `POST /admin/settings/training-topics/:id/delete` - حذف موضوع
13. ✅ `POST /admin/settings/training-topics/reorder` - تغییر ترتیب
14. ✅ `POST /admin/settings/training-topics/test` - تست AI

### User Routes (`/user/*`) - 🆕 جدید:
15. 🆕 `GET /user/training/dashboard` - داشبورد کاربر
16. 🆕 `GET /user/training/record` - ضبط تمرین (ساده)
17. 🆕 `POST /user/training/submit` - ثبت تمرین
18. 🆕 `GET /user/training/progress` - پیشرفت من
19. 🆕 `GET /user/training/history` - تاریخچه تمرینها
20. 🆕 `GET /user/customers/search` - جستجوی مشتری
21. 🆕 `GET /user/customers/:code/history` - تاریخچه مشتری
22. 🆕 `GET /user/leaderboard` - رتبهبندی

### Admin Reports (`/admin/reports/*`) - 🆕 جدید:
23. 🆕 `GET /admin/reports/team` - گزارش تیم
24. 🆕 `GET /admin/reports/training-overview` - خلاصه آموزش
25. 🆕 `GET /admin/reports/forgotten-products` - گزارش کالاهای فراموش شده

### API Routes (`/api/*`) - 🆕 جدید:
26. 🆕 `GET /api/training/metrics` - متریکهای JSON
27. 🆕 `GET /api/customers/nearby` - مشتریان نزدیک (GPS)
28. 🆕 `POST /api/telegram/upload-voice` - آپلود ویس به تلگرام

---

## 📋 1. Admin Tools - Training

### 1.1 صفحه اصلی Training

**Endpoint:** `GET /admin/tools/training`

**هدف:** نمایش فرم ضبط تمرین برای Admin.

**Authentication:** ✅ `requireSystemAdmin`

**Query Parameters:** هیچ

**Response:** HTML Page

```html
<!-- صفحه شامل فرم ضبط صدا، نمایش نتایج تمرین و فیدبک -->
```

---

### 1.2 ضبط و ثبت تمرین

**Endpoint:** `POST /admin/tools/training/record`

**هدف:** پردازش ویس تمرینی و ثبت در Training Engine.

**Authentication:** ✅ `requireSystemAdmin`

**Request Body:**

```json
{
  "topic_key": "speech_tone",
  "transcript": "متن گفتار ضبط شده...",
  "duration_seconds": 120,
  "started_at": "2025-12-27T10:00:00Z",
  "ended_at": "2025-12-27T10:02:00Z"
}
```

**Response (Success):**

```json
{
  "ok": true,
  "result": {
    "phase": "training",
    "score": 75,
    "rolling_avg": 72,
    "threshold": 70,
    "unlocked_next": true,
    "next_topic": "speech_words",
    "leveled_up": false,
    "user_level": 1,
    "exercises": [
      "از جملات فعال استفاده کنید",
      "تاکید بر مزایای محصول"
    ]
  }
}
```

**Response (Baseline Phase):**

```json
{
  "ok": true,
  "result": {
    "phase": "baseline",
    "baseline_voice_count": 2,
    "baseline_voices_count": 3,
    "difficulty_level": "logical",
    "message": "یک ضبط دیگر برای تکمیل Baseline"
  }
}
```

**Service Call:**

```javascript
const trainingEngine = require('../../services/training.engine');

const result = await trainingEngine.processVoice({
  userId: req.session.user.id,
  transcript: req.body.transcript,
  meta: {
    tool: 'training',
    topic_key: req.body.topic_key
  },
  voiceLogId: null
});
```

---

## 📋 2. Admin Tools - Negotiation Analysis

### 2.1 صفحه تحلیل مذاکره

**Endpoint:** `GET /admin/tools/negotiation-analysis`

**هدف:** فرم ضبط مذاکره واقعی با Customer Info + GPS.

**Authentication:** ✅ `requireSystemAdmin`

**Response:** HTML Page

---

### 2.2 ثبت تحلیل مذاکره

**Endpoint:** `POST /admin/tools/negotiation-analysis/submit`

**هدف:** تحلیل مذاکره واقعی + تشخیص کالاهای فراموش شده.

**Authentication:** ✅ `requireSystemAdmin`

**Request Body:**

```json
{
  "customer_code": "CUST-1234",
  "customer_name": "رستوران پارس",
  "customer_industry_id": 5,
  "started_at": "2025-12-27T14:30:00Z",
  "ended_at": "2025-12-27T14:38:00Z",
  "duration_seconds": 480,
  "geo_lat": 35.6892,
  "geo_lng": 51.3890,
  "geo_accuracy": 8.5,
  "transcript_text": "متن کامل مذاکره..."
}
```

**Response:**

```json
{
  "ok": true,
  "report_id": 123,
  "score": 78,
  "weakness_focus": "استفاده از کلمات تردید",
  "missed_strategic_products": [
    {
      "product_id": 101,
      "product_name": "روغن سرخ کردنی X",
      "product_code": "OIL-001"
    }
  ],
  "manager_summary_25": "مذاکره خوب، لحن مناسب، ولی محصول X فراموش شد",
  "manager_key_points": [
    "لحن دوستانه",
    "تکنیکهای فروش خوب",
    "فراموش کردن محصول استراتژیک"
  ],
  "telegram_sent": true
}
```

**Service Calls:**

```javascript
// 1. تشخیص کالاهای فراموش شده
const forgottenProducts = require('../../services/forgottenProducts.service');
const forgotten = await forgottenProducts.detectForgottenProducts(
  transcript_text,
  customer_industry_id
);

// 2. ذخیره گزارش
const reportId = await pool.query(`
  INSERT INTO negotiation_analysis_reports 
    (created_by_user_id, customer_code, customer_name, customer_industry_id,
     started_at, ended_at, duration_seconds, location_lat, location_lng,
     transcript_text, score, weakness_focus, missed_strategic_products,
     manager_summary_25, manager_key_points, telegram_voice_file_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  RETURNING id
`, [userId, customer_code, customer_name, customer_industry_id,
    started_at, ended_at, duration_seconds, geo_lat, geo_lng,
    transcript_text, score, weakness_focus, 
    JSON.stringify(forgotten), summary_25, JSON.stringify(key_points),
    telegram_file_id]);

// 3. ارسال به تلگرام
if (managerTelegramId) {
  await sendTelegramMessage(managerTelegramId, {
    title: 'گزارش مذاکره',
    seller: userName,
    customer: customer_name,
    score: score,
    summary: summary_25,
    forgotten: forgotten.map(p => p.product_name).join(', ')
  });
}
```

---

## 📋 3. Admin Tools - Practice (متنی)

### 3.1 صفحه تمرین متنی

**Endpoint:** `GET /admin/tools/practice`

**Authentication:** ✅ `requireSystemAdmin`

**Response:** HTML Form

---

### 3.2 اجرای تمرین متنی

**Endpoint:** `POST /admin/tools/practice/run`

**Request Body:**

```json
{
  "scenario_text": "سلام، من از شرکت X هستم...",
  "customer_industry_id": 5
}
```

**Response:**

```json
{
  "ok": true,
  "result": {
    "weak_points": [
      "استفاده از کلمات تردید",
      "مکالمه کوتاه"
    ],
    "improved_sentences": [
      "از جملات فعال استفاده کنید",
      "تاکید بر مزایا نه ویژگیها"
    ],
    "say_instead": [
      "سلام، من [نام] از [شرکت] هستم",
      "محصول ما مزایای منحصر به فردی دارد"
    ]
  }
}
```

**Service:**

```javascript
const practiceCoach = require('../../services/negotiation.practice_coach');

const result = await practiceCoach.coachTranscript({
  transcript: scenario_text,
  userId: req.session.user.id
});
```

---

## 📋 4. Admin Settings - Training Config

### 4.1 مشاهده تنظیمات

**Endpoint:** `GET /admin/settings/training-config`

**Authentication:** ✅ `requireSystemAdmin`

**Response:** HTML Page

```html
<!-- فرم شامل:
  - baseline_voices_count: تعداد ویس برای تعیین سطح اولیه
  - rolling_window_n: تعداد آخرین ویس‌ها برای محاسبه میانگین
  - threshold_score: حد آستانه برای unlock موضوع بعدی
-->
```

---

### 4.2 ذخیره تنظیمات

**Endpoint:** `POST /admin/settings/training-config/save`

**Authentication:** ✅ `requireSystemAdmin`

**Request Body:**

```json
{
  "baseline_voices_count": 3,
  "rolling_window_n": 3,
  "threshold_score": 70
}
```

**Response:**

```json
{
  "ok": true,
  "message": "تنظیمات با موفقیت ذخیره شد"
}
```

**SQL:**

```sql
INSERT INTO training_company_settings 
  (company_id, baseline_voices_count, rolling_window_n, threshold_score)
VALUES (NULL, $1, $2, $3)
ON CONFLICT ((company_id IS NULL)) 
WHERE company_id IS NULL
DO UPDATE
  SET baseline_voices_count = EXCLUDED.baseline_voices_count,
      rolling_window_n = EXCLUDED.rolling_window_n,
      threshold_score = EXCLUDED.threshold_score,
      updated_at = NOW();
```

---

## 📋 5. Admin Settings - Training Topics

### 5.1 لیست موضوعات

**Endpoint:** `GET /admin/settings/training-topics`

**Authentication:** ✅ `requireSystemAdmin`

**Response:** HTML Page (Table + Form)

**SQL:**

```sql
SELECT 
  id,
  topic_key,
  title,
  order_index,
  is_enabled,
  provider_mode
FROM training_topics
WHERE company_id IS NULL
ORDER BY order_index ASC, id ASC;
```

---

### 5.2 ایجاد موضوع جدید

**Endpoint:** `POST /admin/settings/training-topics/create`

**Request Body:**

```json
{
  "topic_key": "product_knowledge",
  "title": "دانش محصول",
  "order_index": 4,
  "is_enabled": true,
  "prompt_simple": "دانش محصول را بررسی کن",
  "prompt_logical": "دانش محصول را با جزئیات تحلیل کن",
  "prompt_strict": "دانش محصول را به صورت حرفهای ارزیابی کن",
  "provider_mode": "hybrid",
  "base_url": "http://localhost:11434/api/generate",
  "token": ""
}
```

**Response:**

```json
{
  "ok": true,
  "topic_id": 7,
  "message": "موضوع جدید ایجاد شد"
}
```

---

### 5.3 ویرایش موضوع

**Endpoint:** `POST /admin/settings/training-topics/:id/update`

**Request Body:** همانند create

**Response:**

```json
{
  "ok": true,
  "message": "موضوع بروزرسانی شد"
}
```

---

### 5.4 حذف موضوع

**Endpoint:** `POST /admin/settings/training-topics/:id/delete`

**Response:**

```json
{
  "ok": true,
  "message": "موضوع حذف شد"
}
```

**⚠️ نکته:** قبل از حذف، چک کنید که آیا در `training_scores` استفاده شده؟

```sql
SELECT COUNT(*) AS usage_count
FROM training_scores
WHERE topic_key = (SELECT topic_key FROM training_topics WHERE id = $1);
```

---

### 5.5 تغییر ترتیب (Reorder)

**Endpoint:** `POST /admin/settings/training-topics/reorder`

**Request Body:**

```json
{
  "order": [3, 1, 2, 4]
}
```

**Response:**

```json
{
  "ok": true,
  "message": "ترتیب بروزرسانی شد"
}
```

**SQL:**

```sql
UPDATE training_topics
SET order_index = $1
WHERE id = $2;
```

---

### 5.6 تست AI

**Endpoint:** `POST /admin/settings/training-topics/test`

**Request Body:**

```json
{
  "topic_id": 1,
  "test_transcript": "سلام، من محصول X را معرفی میکنم",
  "difficulty": "simple"
}
```

**Response (Success):**

```json
{
  "ok": true,
  "test_result": {
    "provider": "cloud",
    "response_time_ms": 1250,
    "output": "تحلیل AI: لحن مناسب، کلمات مثبت..."
  }
}
```

**Response (Error):**

```json
{
  "ok": false,
  "error": "AI_CONNECTION_FAILED",
  "message": "اتصال به AI ناموفق بود"
}
```

---

## 📋 6. User Routes - Dashboard

### 6.1 داشبورد کاربر

**Endpoint:** `GET /user/training/dashboard`

**Authentication:** ✅ `requireAuth`

**Response:** HTML Page

**Data Structure:**

```javascript
{
  today: {
    analyzed_count: 5,
    unique_customers: 4,
    avg_score: 72,
    forgotten_count: 3,
    successful_visits: 4
  },
  
  week: {
    analyzed_count: 23,
    avg_score: 68,
    successful_rate: 65,
    forgotten_count: 12
  },
  
  training: {
    current_level: 2,
    current_topic: 'تکنیکهای فروش',
    current_topic_key: 'sales_technique',
    progress_percent: 50,  // 3/6 topics
    next_unlock_score: 70,
    current_avg: 68
  },
  
  recent_visits: [
    {
      customer_name: 'رستوران پارس',
      visit_date: '2025-12-27T10:00:00Z',
      score: 75,
      forgotten_count: 1
    }
  ]
}
```

**SQL Queries:**

```sql
-- امروز
SELECT 
  COUNT(*) AS analyzed_count,
  COUNT(DISTINCT customer_code) AS unique_customers,
  AVG(score)::numeric(5,2) AS avg_score,
  SUM(jsonb_array_length(COALESCE(missed_strategic_products, '[]'::jsonb))) AS forgotten_count,
  COUNT(*) FILTER (WHERE score >= 70) AS successful_visits
FROM negotiation_analysis_reports
WHERE created_by_user_id = $1
  AND created_at >= CURRENT_DATE;

-- وضعیت Training
SELECT 
  user_level,
  difficulty_level,
  current_topic_key
FROM user_training_state
WHERE user_id = $1;

-- موضوع فعلی
SELECT title
FROM training_topics
WHERE topic_key = $2;

-- میانگین متحرک
SELECT AVG(score)::numeric(5,2) AS rolling_avg
FROM (
  SELECT score
  FROM training_scores
  WHERE user_id = $1
    AND topic_key = $2
  ORDER BY created_at DESC
  LIMIT 3
) AS recent;
```

---

## 📋 7. User Routes - Customer Search

### 7.1 جستجوی مشتری

**Endpoint:** `GET /user/customers/search`

**Authentication:** ✅ `requireAuth`

**Query Parameters:**

```
?q=پارس
```

**Response:**

```json
{
  "customers": [
    {
      "customer_code": "CUST-1234",
      "customer_name": "رستوران پارس",
      "last_visit_date": "2025-12-25T10:00:00Z",
      "total_visits": 12,
      "avg_score": 68,
      "total_forgotten_count": 5,
      "last_seller_name": "علی رضایی"
    }
  ]
}
```

**SQL:**

```sql
SELECT 
  cvs.customer_code,
  cvs.customer_name,
  cvs.last_visit_date,
  cvs.total_visits,
  cvs.avg_score,
  cvs.total_forgotten_count,
  u.first_name || ' ' || u.last_name AS last_seller_name
FROM customer_visit_summary cvs
LEFT JOIN users u ON u.id = cvs.last_seller_id
WHERE cvs.customer_code ILIKE $1
   OR cvs.customer_name ILIKE $1
ORDER BY cvs.last_visit_date DESC NULLS LAST
LIMIT 20;
```

---

### 7.2 تاریخچه مشتری

**Endpoint:** `GET /user/customers/:code/history`

**Authentication:** ✅ `requireAuth`

**Response:** HTML Page

**Data Structure:**

```javascript
{
  summary: {
    customer_code: 'CUST-1234',
    customer_name: 'رستوران پارس',
    total_visits: 12,
    avg_score: 68,
    total_forgotten_count: 15
  },
  
  mostForgotten: [
    { name: 'روغن X', code: 'OIL-001', forgotten_count: 5 },
    { name: 'نوشابه Y', code: 'SODA-002', forgotten_count: 3 }
  ],
  
  visits: [
    {
      id: 123,
      visit_date: '2025-12-25T10:00:00Z',
      seller_name: 'علی رضایی',
      duration_seconds: 480,
      score: 72,
      weakness_focus: 'تردید',
      missed_products: ['روغن X', 'نوشابه Y'],
      telegram_voice_file_id: 'BQACAgQA...'
    }
  ]
}
```

---

## 📋 8. User Routes - Leaderboard

### 8.1 رتبهبندی

**Endpoint:** `GET /user/leaderboard`

**Authentication:** ✅ `requireAuth`

**Query Parameters:**

```
?scope=team    // team | branch | company
```

**Response:** HTML Page

**Data Structure:**

```javascript
{
  my_rank: {
    rank: 5,
    score: 72,
    total_visits: 23
  },
  
  leaderboard: [
    {
      rank: 1,
      user_name: 'علی رضایی',
      avg_score: 85,
      total_visits: 45,
      badge: '🥇'
    },
    {
      rank: 2,
      user_name: 'محمد احمدی',
      avg_score: 78,
      total_visits: 38,
      badge: '🥈'
    }
  ]
}
```

**SQL:**

```sql
-- رتبهبندی تیم
WITH team_scores AS (
  SELECT 
    nar.created_by_user_id,
    u.first_name || ' ' || u.last_name AS user_name,
    AVG(nar.score)::numeric(5,2) AS avg_score,
    COUNT(*) AS total_visits,
    RANK() OVER (ORDER BY AVG(nar.score) DESC) AS rank
  FROM negotiation_analysis_reports nar
  JOIN users u ON u.id = nar.created_by_user_id
  WHERE u.manager_id = (
    SELECT manager_id FROM users WHERE id = $1
  )
    AND nar.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY nar.created_by_user_id, u.first_name, u.last_name
)
SELECT * FROM team_scores
ORDER BY rank ASC
LIMIT 10;
```

---

## 📋 9. Admin Reports - Team Performance

### 9.1 گزارش تیم

**Endpoint:** `GET /admin/reports/team`

**Authentication:** ✅ `requireAuth` (Manager or Admin)

**Response:** HTML Page

**Data Structure:**

```javascript
{
  team_summary: {
    total_members: 12,
    active_today: 10,
    team_avg_score: 68,
    total_visits_today: 47,
    successful_visits: 32,
    success_rate: 68,
    total_forgotten: 18
  },
  
  members: [
    {
      user_id: 5,
      name: 'علی رضایی',
      today_visits: 5,
      today_avg_score: 72,
      forgotten_count: 2,
      training_level: 2,
      training_progress: 65
    }
  ],
  
  top_performers: [
    { name: 'علی رضایی', score: 85, badge: '🥇' }
  ],
  
  weak_points: [
    { weakness: 'استفاده از کلمات تردید', count: 25, percent: 53 }
  ]
}
```

---

## 📋 10. API Routes - GPS Nearby

### 10.1 مشتریان نزدیک

**Endpoint:** `GET /api/customers/nearby`

**Authentication:** ✅ `requireAuth`

**Query Parameters:**

```
?lat=35.6892&lng=51.3890&radius=50
```

**Response:**

```json
{
  "nearby": [
    {
      "customer_code": "CUST-1234",
      "customer_name": "رستوران پارس",
      "distance_m": 25,
      "forgotten_products": [
        {
          "product_name": "روغن X",
          "last_forgotten": "2025-12-20T10:00:00Z"
        }
      ]
    }
  ]
}
```

**SQL:**

```sql
SELECT 
  c.customer_code,
  c.customer_name,
  calculate_distance($1, $2, c.location_lat, c.location_lng) AS distance_m
FROM customers c
WHERE calculate_distance($1, $2, c.location_lat, c.location_lng) <= $3
ORDER BY distance_m ASC
LIMIT 5;
```

---

## 📋 11. API Routes - Telegram Upload

### 11.1 آپلود ویس به تلگرام

**Endpoint:** `POST /api/telegram/upload-voice`

**Authentication:** ✅ `requireAuth`

**Request:** `multipart/form-data`

```
voice: [binary file]
```

**Response:**

```json
{
  "ok": true,
  "telegram_file_id": "BQACAgQAAxkBAAIC..."
}
```

**Service:**

```javascript
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadVoiceToTelegram(audioBuffer) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_STORAGE_CHAT_ID;
  
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('voice', audioBuffer, {
    filename: 'voice.ogg',
    contentType: 'audio/ogg'
  });
  
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendVoice`,
    {
      method: 'POST',
      body: form
    }
  );
  
  const data = await response.json();
  
  if (data.ok) {
    return data.result.voice.file_id;
  } else {
    throw new Error('TELEGRAM_UPLOAD_FAILED');
  }
}
```

---

## 🔐 Authentication Middleware

### requireAuth

```javascript
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
}
```

### requireSystemAdmin

```javascript
function requireSystemAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/admin/login');
  }
  
  if (req.session.user.role !== 'SYSTEM_ADMIN') {
    return res.status(403).json({
      ok: false,
      error: 'FORBIDDEN',
      message: 'دسترسی ندارید'
    });
  }
  
  next();
}
```

---

## ⚠️ Error Responses

### Standard Error Format:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "پیغام خطا به فارسی"
}
```

### Common Error Codes:

| کد | توضیحات |
|----|---------|
| `USER_NOT_FOUND` | کاربر یافت نشد |
| `TOPIC_NOT_FOUND` | موضوع یافت نشد |
| `INVALID_SCORE` | امتیاز نامعتبر (خارج از 0-100) |
| `AI_CONNECTION_FAILED` | اتصال به AI ناموفق |
| `TELEGRAM_UPLOAD_FAILED` | آپلود به تلگرام ناموفق |
| `FORBIDDEN` | دسترسی غیرمجاز |
| `VALIDATION_ERROR` | خطای اعتبارسنجی ورودی |

---

## 📌 Document Metadata

- **Created**: 2025-12-27
- **Author**: smkhadivpoor
- **Version**: 1.0
- **Status**: Complete API Documentation
