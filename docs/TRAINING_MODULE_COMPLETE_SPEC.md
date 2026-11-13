# 📋 TRAINING MODULE - COMPLETE SPECIFICATION

این سند کاملترین مرجع برای پیادهسازی **ماژول آموزش فروش** در پروژه ToInfinity است.

---

## 🎯 1. نمای کلی (Overview)

### هدف: 
سیستم آموزش فروش برای **ارتقای مهارت فروشندگان** از طریق: 
- ضبط ویس مذاکرات واقعی و تمرینی
- تحلیل هوش مصنوعی (AI) با سه سطح سختگیری
- امتیازدهی 0-100 و تعیین سطح (آماتور/نیمهحرفهای/حرفهای)
- سیستم progression با موضوعات (Topics) و سطوح (Levels)
- تشخیص کالاهای فراموش شده استراتژیک
- تاریخچه مراجعات مشتری
- GPS Proximity Alert (یادآوری نزدیک مشتری)
- گزارشات فردی، تیمی و شرکتی
- Dashboard برای فروشنده و مدیر

---

## 🏗️ 2. معماری سیستم

### 2.1 سه نوع ابزار آموزشی: 

| نوع | هدف | ورودی | خروجی | اثر در Progression | ذخیره در DB |
|-----|------|-------|-------|-------------------|--------------|
| **🟢 Training** | تمرین محض با progression | Voice | Score + Exercises + Level Up | ✅ بله | ✅ بله |
| **🔵 Analysis** | تحلیل مذاکره واقعی | Voice + Customer + GPS | Report + Forgotten Products | ❌ خیر | ✅ بله |
| **🟡 Practice** | تمرین متنی سریع | Text | Suggestions (template-based) | ❌ خیر | ❌ خیر |

### 2.2 فرآیند Training Progression:

```
┌─────────────────────────────────────────┐
│  1. Baseline Phase                      │
│  - 3 ضبط اولیه                         │
│  - تعیین Difficulty (simple/logical/strict) │
│  - بدون امتیاز                         │
└─────────────┬───────────────────────────┘
              ▼
┌─────────────────────────────────────────┐
│  2. Training Phase                      │
│  - Topic 1: کلام                       │
│    • ضبط → Score → Rolling Avg (3 تا)  │
│    • اگر >= 70 → Unlock Topic 2        │
│  - Topic 2: لحن                        │
│    • همین فرآیند                       │
│  - ...  (تا 6 topic)                    │
└─────────────┬───────────────────────────┘
              ▼
┌─────────────────────────────────────────┐
│  3. Level Up                            │
│  - اگر همه Topics >= 70                │
│  - Level += 1, Cycle += 1              │
│  - شروع دوباره از Topic 1              │
│  - Difficulty بالاتر (Prompt سختتر)   │
└─────────────────────────────────────────┘
```

### 2.3 قوانین مهم:
- ✅ Voice Enrollment اختیاری است (برای Speaker Verification)
- ✅ اگر `speaker_match_score < 0.5` → flag `suspicious = true` ولی تحلیل انجام میشود
- ✅ Topics **به ترتیب** unlock میشوند (نمیتوان پرید)
- ✅ Rolling Average = میانگین **آخرین 3 امتیاز** (قابل تنظیم)
- ✅ Threshold = **70** (قابل تنظیم)
- ✅ AI Fallback:  اگر AI نباشد → محاسبات Local

---

## 🗄️ 3. ساختار دیتابیس

### 3.1 جداول موجود (در migrations 005 و 012):

#### training_company_settings
```sql
CREATE TABLE IF NOT EXISTS public.training_company_settings (
  id SERIAL PRIMARY KEY,
  company_id uuid NULL,
  baseline_voices_count INT NOT NULL DEFAULT 3,
  rolling_window_n INT NOT NULL DEFAULT 3,
  threshold_score INT NOT NULL DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### training_topics
```sql
CREATE TABLE IF NOT EXISTS public.training_topics (
  id SERIAL PRIMARY KEY,
  company_id uuid NULL,
  topic_key TEXT NOT NULL,
  title TEXT,
  order_index INT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  prompt_simple TEXT,
  prompt_logical TEXT,
  prompt_strict TEXT,
  provider_mode TEXT NOT NULL DEFAULT 'hybrid',
  token TEXT,
  base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### user_training_state
```sql
CREATE TABLE IF NOT EXISTS public.user_training_state (
  user_id uuid PRIMARY KEY,
  user_level INT NOT NULL DEFAULT 1,
  difficulty_level TEXT,
  baseline_done BOOLEAN NOT NULL DEFAULT FALSE,
  baseline_voice_count INT NOT NULL DEFAULT 0,
  current_topic_key TEXT,
  cycle_id INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### training_scores
```sql
CREATE TABLE IF NOT EXISTS public.training_scores (
  id SERIAL PRIMARY KEY,
  user_id uuid NOT NULL,
  topic_key TEXT NOT NULL,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  voice_log_id INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### voice_enrollment
```sql
CREATE TABLE IF NOT EXISTS public.voice_enrollment (
  user_id uuid PRIMARY KEY,
  enrollment_version INT NOT NULL DEFAULT 1,
  embedding_json TEXT,
  sample_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### negotiation_analysis_reports
```sql
-- جدول موجود - فقط یک ستون اضافه میشود
ALTER TABLE public.negotiation_analysis_reports
  ADD COLUMN IF NOT EXISTS telegram_voice_file_id TEXT;
```

### 3.2 جداول جدید (migration 018):

#### product_industries (Many-to-Many)
```sql
CREATE TABLE IF NOT EXISTS public.product_industries (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  industry_id INT NOT NULL REFERENCES customer_industries(id) ON DELETE CASCADE,
  is_strategic BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, industry_id)
);
```

**هدف:** ارتباط محصولات با صنایع - یک محصول میتواند برای چند صنف استراتژیک باشد.

#### customer_visit_summary (Cache)
```sql
CREATE TABLE IF NOT EXISTS public.customer_visit_summary (
  customer_code TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  last_visit_date TIMESTAMPTZ,
  total_visits INT NOT NULL DEFAULT 0,
  last_seller_id uuid,
  avg_score NUMERIC(5,2),
  total_forgotten_count INT NOT NULL DEFAULT 0,
  most_forgotten_products JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**هدف:** خلاصه سریع مراجعات هر مشتری - بروزرسانی خودکار با Trigger.

#### manager_performance_cache
```sql
CREATE TABLE IF NOT EXISTS public.manager_performance_cache (
  manager_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_avg_score NUMERIC(10,2),
  total_visits INT NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2),
  total_forgotten INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**هدف:** کش عملکرد مدیران - بروزرسانی شبانه با Cron Job.

---

## 📁 4. Migration Script (018)

**File:** `migrations/018_training_module_enhancements.sql`

```sql
-- Training Module Enhancements
BEGIN;

-- 1. Telegram voice file ID
ALTER TABLE public.negotiation_analysis_reports
  ADD COLUMN IF NOT EXISTS telegram_voice_file_id TEXT;

CREATE INDEX IF NOT EXISTS idx_nar_telegram_file 
  ON public.negotiation_analysis_reports(telegram_voice_file_id);

-- 2. Product-Industry Many-to-Many
CREATE TABLE IF NOT EXISTS public.product_industries (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  industry_id INT NOT NULL REFERENCES customer_industries(id) ON DELETE CASCADE,
  is_strategic BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, industry_id)
);

CREATE INDEX IF NOT EXISTS idx_product_industries_product ON product_industries(product_id);
CREATE INDEX IF NOT EXISTS idx_product_industries_industry ON product_industries(industry_id);
CREATE INDEX IF NOT EXISTS idx_product_industries_strategic 
  ON product_industries(industry_id, is_strategic) 
  WHERE is_strategic = TRUE;

-- 3. Customer Visit Summary Cache
CREATE TABLE IF NOT EXISTS public.customer_visit_summary (
  customer_code TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  last_visit_date TIMESTAMPTZ,
  total_visits INT NOT NULL DEFAULT 0,
  last_seller_id uuid,
  avg_score NUMERIC(5,2),
  total_forgotten_count INT NOT NULL DEFAULT 0,
  most_forgotten_products JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cvs_last_visit ON customer_visit_summary(last_visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_cvs_customer_name 
  ON customer_visit_summary USING gin(to_tsvector('simple', customer_name));

-- 4. Manager Performance Cache
CREATE TABLE IF NOT EXISTS public.manager_performance_cache (
  manager_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_avg_score NUMERIC(10,2),
  total_visits INT NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2),
  total_forgotten INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpc_score ON manager_performance_cache(team_avg_score DESC);

-- 5. Trigger: Update customer_visit_summary
CREATE OR REPLACE FUNCTION update_customer_visit_summary()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO customer_visit_summary (
    customer_code,
    customer_name,
    last_visit_date,
    total_visits,
    last_seller_id,
    avg_score,
    total_forgotten_count
  )
  SELECT 
    NEW.customer_code,
    NEW.customer_name,
    NEW.created_at,
    COUNT(*),
    NEW.created_by_user_id,
    AVG(score)::numeric(5,2),
    SUM(jsonb_array_length(COALESCE(missed_strategic_products, '[]'::jsonb)))
  FROM negotiation_analysis_reports
  WHERE customer_code = NEW.customer_code
  GROUP BY customer_code, customer_name
  ON CONFLICT (customer_code) DO UPDATE
    SET last_visit_date = EXCLUDED.last_visit_date,
        total_visits = EXCLUDED.total_visits,
        last_seller_id = EXCLUDED.last_seller_id,
        avg_score = EXCLUDED.avg_score,
        total_forgotten_count = EXCLUDED.total_forgotten_count,
        updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_customer_visit_summary ON negotiation_analysis_reports;
CREATE TRIGGER trg_update_customer_visit_summary
AFTER INSERT ON negotiation_analysis_reports
FOR EACH ROW
EXECUTE FUNCTION update_customer_visit_summary();

-- 6. GPS Distance Function (Haversine)
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  R CONSTANT DOUBLE PRECISION := 6371000;
  dLat DOUBLE PRECISION;
  dLng DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dLat := RADIANS(lat2 - lat1);
  dLng := RADIANS(lng2 - lng1);
  
  a := SIN(dLat/2) * SIN(dLat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dLng/2) * SIN(dLng/2);
  
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;
```

---

## 🔧 5. Services

### 5.1 Forgotten Products Detection

**File:** `src/services/forgottenProducts.service.js`

```javascript
'use strict';

const pool = require('../config/db');

/**
 * تشخیص کالاهای استراتژیک فراموش شده
 */
async function detectForgottenProducts(transcript, customerIndustryId) {
  if (!customerIndustryId) return [];
  
  // دریافت کالاهای استراتژیک مرتبط با این صنف
  const result = await pool.query(`
    SELECT DISTINCT p.id, p.name, p.code
    FROM products p
    JOIN product_industries pi ON pi.product_id = p.id
    WHERE pi.industry_id = $1
      AND pi.is_strategic = TRUE
    ORDER BY pi.priority ASC, p.name ASC
  `, [customerIndustryId]);
  
  const strategicProducts = result.rows || [];
  const forgotten = [];
  const text = (transcript || '').toLowerCase();
  
  for (const product of strategicProducts) {
    const mentioned = (
      text.includes(product.name.toLowerCase()) ||
      (product.code && text.includes(product.code.toLowerCase()))
    );
    
    if (!mentioned) {
      forgotten.push({
        product_id: product.id,
        product_name: product.name,
        product_code: product.code
      });
    }
  }
  
  return forgotten;
}

/**
 * ذخیره کالاهای فراموش شده
 */
async function saveForgottenProducts(userId, customerId, forgottenProducts, voiceLogId) {
  if (!forgottenProducts || forgottenProducts.length === 0) return;
  
  for (const product of forgottenProducts) {
    await pool.query(`
      INSERT INTO forgotten_key_products 
        (user_id, customer_id, product_id, voice_log_id, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [userId, customerId, product.product_id, voiceLogId]);
  }
}

/**
 * دریافت کالاهای فراموش شده قبلی برای یک مشتری
 */
async function getRecentForgottenProducts(userId, customerCode, days = 7) {
  const result = await pool.query(`
    SELECT DISTINCT 
      p.id,
      p.name,
      p.code,
      MAX(fkp.created_at) AS last_forgotten
    FROM forgotten_key_products fkp
    JOIN products p ON p.id = fkp.product_id
    JOIN negotiation_analysis_reports nar ON nar.id = fkp.voice_log_id
    WHERE fkp.user_id = $1
      AND nar.customer_code = $2
      AND fkp.created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY p.id, p.name, p.code
    ORDER BY last_forgotten DESC
    LIMIT 3
  `, [userId, customerCode]);
  
  return result.rows || [];
}

module.exports = {
  detectForgottenProducts,
  saveForgottenProducts,
  getRecentForgottenProducts
};
```

### 5.2 Customer Visit History

**File:** `src/services/customerVisitHistory.service.js`

```javascript
'use strict';

const pool = require('../config/db');

/**
 * جستجوی مشتری
 */
async function searchCustomers(query) {
  const result = await pool.query(`
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
    LIMIT 20
  `, [`%${query}%`]);
  
  return result.rows || [];
}

/**
 * تاریخچه کامل مراجعات یک مشتری
 */
async function getCustomerHistory(customerCode) {
  // 1. خلاصه کلی
  const summaryResult = await pool.query(`
    SELECT * FROM customer_visit_summary
    WHERE customer_code = $1
  `, [customerCode]);
  
  const summary = summaryResult.rows[0] || null;
  
  // 2. کالاهای پرتکرار فراموش شده
  const forgottenResult = await pool.query(`
    SELECT 
      p.name,
      p.code,
      COUNT(*) AS forgotten_count
    FROM forgotten_key_products fkp
    JOIN products p ON p.id = fkp.product_id
    JOIN negotiation_analysis_reports nar ON nar.id = fkp.voice_log_id
    WHERE nar.customer_code = $1
      AND fkp.created_at >= NOW() - INTERVAL '6 months'
    GROUP BY p.id, p.name, p.code
    ORDER BY forgotten_count DESC
    LIMIT 5
  `, [customerCode]);
  
  const mostForgotten = forgottenResult.rows || [];
  
  // 3. لیست مذاکرات
  const visitsResult = await pool.query(`
    SELECT 
      nar.id,
      nar.created_at AS visit_date,
      nar.created_by_user_id,
      u.first_name || ' ' || u.last_name AS seller_name,
      nar.duration_seconds,
      nar.score,
      nar.weakness_focus,
      nar.missed_strategic_products,
      nar.manager_summary_25,
      nar.manager_key_points,
      nar.telegram_voice_file_id
    FROM negotiation_analysis_reports nar
    LEFT JOIN users u ON u.id = nar.created_by_user_id
    WHERE nar.customer_code = $1
    ORDER BY nar.created_at DESC
    LIMIT 20
  `, [customerCode]);
  
  const visits = visitsResult.rows || [];
  
  return {
    summary,
    mostForgotten,
    visits
  };
}

module.exports = {
  searchCustomers,
  getCustomerHistory
};
```

---

## 📡 6. API Endpoints

### 6.1 User Routes

**File:** `src/routes/user/training.routes.js`

```javascript
'use strict';

const express = require('express');
const router = express.Router();
const trainingEngine = require('../../services/training.engine');
const customerService = require('../../services/customerVisitHistory.service');

// Dashboard
router.get('/dashboard', async (req, res) => {
  const userId = req.session.user.id;
  
  // TODO: دریافت متریکهای dashboard
  
  res.render('user/training/dashboard', {
    user: req.session.user,
    metrics: {}
  });
});

// جستجوی مشتری
router.get('/customers/search', async (req, res) => {
  const query = req.query.q || '';
  
  if (!query) {
    return res.json({ customers: [] });
  }
  
  const customers = await customerService.searchCustomers(query);
  res.json({ customers });
});

// تاریخچه مشتری
router.get('/customers/:code/history', async (req, res) => {
  const customerCode = req.params.code;
  const history = await customerService.getCustomerHistory(customerCode);
  
  res.render('user/training/customer_history', {
    user: req.session.user,
    customerCode,
    ...history
  });
});

module.exports = router;
```

---

## ⏰ 7. Cron Jobs

### 7.1 Manager Performance Update

**File:** `src/jobs/updateManagerPerformance.job.js`

```javascript
'use strict';

const pool = require('../config/db');

async function updateAllManagerScores() {
  console.log('[ManagerPerformance] Starting update...');
  
  try {
    // همه مدیران
    const managersResult = await pool.query(`
      SELECT DISTINCT manager_id
      FROM users
      WHERE manager_id IS NOT NULL
    `);
    
    for (const row of managersResult.rows || []) {
      const managerId = row.manager_id;
      
      // محاسبه متریکها
      const metricsResult = await pool.query(`
        SELECT 
          COUNT(*) AS total_visits,
          AVG(nar.score)::numeric(10,2) AS team_avg_score,
          (COUNT(*) FILTER (WHERE nar.score >= 70)::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,2) AS success_rate,
          SUM(jsonb_array_length(COALESCE(nar.missed_strategic_products, '[]'::jsonb))) AS total_forgotten
        FROM negotiation_analysis_reports nar
        JOIN users u ON u.id = nar.created_by_user_id
        WHERE u.manager_id = $1
          AND nar.created_at >= NOW() - INTERVAL '30 days'
      `, [managerId]);
      
      const metrics = metricsResult.rows[0] || {};
      
      // ذخیره در cache
      await pool.query(`
        INSERT INTO manager_performance_cache 
          (manager_id, team_avg_score, total_visits, success_rate, total_forgotten, calculated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (manager_id) DO UPDATE
          SET team_avg_score = EXCLUDED.team_avg_score,
              total_visits = EXCLUDED.total_visits,
              success_rate = EXCLUDED.success_rate,
              total_forgotten = EXCLUDED.total_forgotten,
              calculated_at = NOW()
      `, [
        managerId,
        metrics.team_avg_score || 0,
        metrics.total_visits || 0,
        metrics.success_rate || 0,
        metrics.total_forgotten || 0
      ]);
    }
    
    console.log('[ManagerPerformance] Update completed');
  } catch (err) {
    console.error('[ManagerPerformance] Error:', err);
  }
}

// اجرای شبانه (ساعت 23:00)
const schedule = require('node-schedule');
schedule.scheduleJob('0 23 * * *', updateAllManagerScores);

module.exports = { updateAllManagerScores };
```

---

## ✅ 8. Checklist پیادهسازی

### Database
- [ ] اجرای migration `018_training_module_enhancements.sql`
- [ ] تست جداول و trigger
- [ ] تست function `calculate_distance`

### Backend - Services
- [ ] ساخت `forgottenProducts.service.js`
- [ ] ساخت `customerVisitHistory.service.js`
- [ ] بروزرسانی `training.engine.js` برای Integration

### Backend - Routes
- [ ] ساخت `/user/training/*` routes
- [ ] اضافه کردن customer search/history endpoints

### Frontend
- [ ] User Dashboard UI
- [ ] Customer Search UI
- [ ] Customer History UI
- [ ] GPS Proximity Alert (Service Worker)

### Jobs
- [ ] ساخت `updateManagerPerformance.job.js`
- [ ] اضافه کردن به `app.js`

### Testing
- [ ] تست Forgotten Products Detection
- [ ] تست Customer Visit Summary Trigger
- [ ] تست GPS Distance Calculation
- [ ] تست Manager Performance Cache

---

## 🎯 9. نکات مهم

1. **Migration اول**: همیشه اول migration رو اجرا کن
2. **Idempotent**: همه scriptها idempotent هستند
3. **Backward Compatible**: تغییرات breaking change ندارند
4. **GPS Function**: از Haversine استفاده میشود (دقت تا 1 متر)
5. **Cache Strategy**: customer_visit_summary و manager_performance_cache برای سرعت
6. **Trigger Safety**: trigger فقط INSERT رو میگیرد (نه UPDATE)
7. **Voice Storage**: فقط در تلگرام ذخیره میشود
8. **JSONB Indexing**: برای جستجوی سریع نام مشتری
9. **Forgotten Products**: Many-to-Many برای انعطاف بیشتر
10. **Error Handling**: همه serviceها try-catch دارند

---

**این سند آماده است برای استفاده توسط Coding Agent.**

---

## 📌 Document Metadata

- **Created**: 2025-12-27
- **Author**: smkhadivpoor  
- **Version**: 1.0
- **Status**: Complete Specification
- **Purpose**: Complete implementation guide for Training Module in ToInfinity project
