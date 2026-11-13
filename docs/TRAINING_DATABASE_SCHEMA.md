# 📊 TRAINING MODULE - DATABASE SCHEMA

این سند شامل **جزئیات کامل Schema** دیتابیس ماژول آموزش است.

---

## 📑 فهرست جداول

### جداول موجود (قبلی):
1. ✅ `training_company_settings` - تنظیمات شرکت
2. ✅ `training_topics` - موضوعات آموزشی
3. ✅ `user_training_state` - وضعیت آموزشی هر کاربر
4. ✅ `training_scores` - امتیازات ثبت شده
5. ✅ `voice_enrollment` - ثبت نمونه صدا
6. ✅ `forgotten_key_products` - کالاهای فراموش شده
7. ✅ `negotiation_analysis_reports` - گزارشات تحلیل مذاکره

### جداول جدید (migration 018):
8. 🆕 `product_industries` - ارتباط محصول و صنعت
9. 🆕 `customer_visit_summary` - خلاصه مراجعات مشتری
10. 🆕 `manager_performance_cache` - کش عملکرد مدیران

---

## 📋 1. training_company_settings

**هدف:** تنظیمات عمومی سیستم آموزش برای کل شرکت.

**Migration:** `005_training_priority_engine.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `id` | SERIAL | NO | AUTO | شناسه یکتا |
| `company_id` | uuid | YES | NULL | شناسه شرکت (NULL = تنظیمات پیشفرض) |
| `baseline_voices_count` | INT | NO | 3 | تعداد ضبط برای Baseline Phase |
| `rolling_window_n` | INT | NO | 3 | تعداد امتیازات برای میانگین متحرک |
| `threshold_score` | INT | NO | 70 | آستانه قبولی هر موضوع |
| `created_at` | TIMESTAMPTZ | NO | NOW() | تاریخ ایجاد |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | تاریخ آخرین بروزرسانی |

### Constraints:

```sql
-- Singleton pattern: یک ردیف برای هر company
CREATE UNIQUE INDEX IF NOT EXISTS training_company_settings_company_not_null_idx
  ON public.training_company_settings (company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_company_settings_singleton_idx
  ON public.training_company_settings ((company_id IS NULL))
  WHERE company_id IS NULL;
```

### Triggers:

```sql
CREATE TRIGGER trg_training_company_settings_updated_at
BEFORE UPDATE ON public.training_company_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```

### مثال داده:

```sql
INSERT INTO training_company_settings 
  (company_id, baseline_voices_count, rolling_window_n, threshold_score)
VALUES 
  (NULL, 3, 3, 70);  -- تنظیمات پیشفرض
```

---

## 📋 2. training_topics

**هدف:** تعریف موضوعات آموزشی و تنظیمات AI هر موضوع.

**Migration:** `005_training_priority_engine.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `id` | SERIAL | NO | AUTO | شناسه یکتا |
| `company_id` | uuid | YES | NULL | شناسه شرکت |
| `topic_key` | TEXT | NO | - | کلید یکتای موضوع (مثل `speech_tone`) |
| `title` | TEXT | YES | NULL | عنوان فارسی موضوع |
| `order_index` | INT | YES | NULL | ترتیب نمایش/اجرا |
| `is_enabled` | BOOLEAN | NO | TRUE | فعال/غیرفعال |
| `prompt_simple` | TEXT | YES | NULL | پرامپت AI برای سطح ساده |
| `prompt_logical` | TEXT | YES | NULL | پرامپت AI برای سطح منطقی |
| `prompt_strict` | TEXT | YES | NULL | پرامپت AI برای سطح سختگیرانه |
| `provider_mode` | TEXT | NO | `hybrid` | نوع provider: `cloud`, `local`, `hybrid` |
| `token` | TEXT | YES | NULL | API token (برای cloud) |
| `base_url` | TEXT | YES | NULL | آدرس API |
| `created_at` | TIMESTAMPTZ | NO | NOW() | تاریخ ایجاد |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | تاریخ آخرین بروزرسانی |

### Constraints:

```sql
-- یکتایی: هر topic_key فقط یکبار برای هر company
CREATE UNIQUE INDEX IF NOT EXISTS training_topics_company_topic_key_uniq
  ON public.training_topics (company_id, topic_key)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_topics_topic_key_singleton
  ON public.training_topics (topic_key)
  WHERE company_id IS NULL;

-- ایندکس برای ترتیب
CREATE INDEX IF NOT EXISTS training_topics_company_order_idx
  ON public.training_topics (company_id, order_index);
```

### Triggers:

```sql
CREATE TRIGGER trg_training_topics_updated_at
BEFORE UPDATE ON public.training_topics
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```

### مثال داده:

```sql
INSERT INTO training_topics 
  (company_id, topic_key, title, order_index, is_enabled, prompt_simple, provider_mode)
VALUES 
  (NULL, 'speech_tone', 'لحن صحبت', 1, TRUE, 'تحلیل لحن این مذاکره را بررسی کن', 'hybrid'),
  (NULL, 'speech_words', 'کلام', 2, TRUE, 'انتخاب واژگان در این مذاکره را تحلیل کن', 'hybrid'),
  (NULL, 'sales_technique', 'تکنیکهای فروش', 3, TRUE, 'تکنیکهای فروش مورد استفاده را ارزیابی کن', 'hybrid');
```

---

## 📋 3. user_training_state

**هدف:** وضعیت جاری آموزشی هر کاربر.

**Migration:** `005_training_priority_engine.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `user_id` | uuid | NO | - | شناسه کاربر (PK) |
| `user_level` | INT | NO | 1 | سطح فعلی کاربر (1, 2, 3, ...) |
| `difficulty_level` | TEXT | YES | NULL | سطح سختگیری: `simple`, `logical`, `strict` |
| `baseline_done` | BOOLEAN | NO | FALSE | آیا Baseline تمام شده؟ |
| `baseline_voice_count` | INT | NO | 0 | تعداد ضبطهای Baseline |
| `current_topic_key` | TEXT | YES | NULL | موضوع جاری در حال تمرین |
| `cycle_id` | INT | NO | 1 | شماره دور (هربار Level up → cycle++) |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | تاریخ آخرین بروزرسانی |

### Constraints:

```sql
-- Primary Key
ALTER TABLE user_training_state ADD PRIMARY KEY (user_id);

-- Check: difficulty_level
ALTER TABLE user_training_state 
  ADD CONSTRAINT user_training_state_difficulty_check 
  CHECK (difficulty_level IN ('simple', 'logical', 'strict') OR difficulty_level IS NULL);
```

### Foreign Keys:

```sql
ALTER TABLE user_training_state
  ADD CONSTRAINT user_training_state_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

### Indexes:

```sql
CREATE INDEX IF NOT EXISTS user_training_state_user_id_idx 
  ON public.user_training_state (user_id);
```

### Triggers:

```sql
CREATE TRIGGER trg_user_training_state_updated_at
BEFORE UPDATE ON public.user_training_state
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```

### مثال داده:

```sql
-- کاربر در Baseline Phase
INSERT INTO user_training_state 
  (user_id, user_level, baseline_done, baseline_voice_count)
VALUES 
  ('123e4567-e89b-12d3-a456-426614174000', 1, FALSE, 2);

-- کاربر در Training Phase
INSERT INTO user_training_state 
  (user_id, user_level, difficulty_level, baseline_done, baseline_voice_count, current_topic_key, cycle_id)
VALUES 
  ('223e4567-e89b-12d3-a456-426614174001', 1, 'logical', TRUE, 3, 'speech_tone', 1);
```

---

## 📋 4. training_scores

**هدف:** ذخیره امتیازات هر ضبط برای هر موضوع.

**Migration:** `005_training_priority_engine.sql`

### Schema:

```sql
CREATE TABLE IF NOT EXISTS public.training_scores (
  id SERIAL PRIMARY KEY,
  user_id uuid NOT NULL,
  topic_key TEXT NOT NULL,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  voice_log_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `id` | SERIAL | NO | AUTO | شناسه یکتا |
| `user_id` | uuid | NO | - | شناسه کاربر |
| `topic_key` | TEXT | NO | - | کلید موضوع |
| `score` | INT | NO | - | امتیاز (0-100) |
| `voice_log_id` | TEXT | YES | NULL | ارجاع به voice_logs (اختیاری) |
| `created_at` | TIMESTAMPTZ | NO | NOW() | تاریخ ثبت |

### Constraints:

```sql
-- Check: score range
ALTER TABLE training_scores 
  ADD CONSTRAINT training_scores_score_range
  CHECK (score >= 0 AND score <= 100);
```

### Foreign Keys:

```sql
ALTER TABLE training_scores
  ADD CONSTRAINT training_scores_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

### Indexes:

```sql
-- برای محاسبه rolling average
CREATE INDEX IF NOT EXISTS training_scores_user_topic_created_idx
  ON public.training_scores (user_id, topic_key, created_at DESC);

-- برای query سریعتر
CREATE INDEX IF NOT EXISTS training_scores_user_id_idx 
  ON public.training_scores (user_id);
```

### Query مثال (Rolling Average):

```sql
-- آخرین 3 امتیاز برای یک کاربر در یک موضوع
SELECT AVG(score)::numeric(5,2) AS rolling_avg
FROM (
  SELECT score
  FROM training_scores
  WHERE user_id = '123e4567-e89b-12d3-a456-426614174000'
    AND topic_key = 'speech_tone'
  ORDER BY created_at DESC
  LIMIT 3
) AS recent;
```

---

## 📋 5. voice_enrollment

**هدف:** ذخیره نمونههای صدا برای Speaker Verification.

**Migration:** `005_training_priority_engine.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `user_id` | uuid | NO | - | شناسه کاربر (PK) |
| `enrollment_version` | INT | NO | 1 | نسخه الگوریتم (برای مهاجرت) |
| `embedding_json` | TEXT | YES | NULL | Vector embedding به صورت JSON |
| `sample_count` | INT | NO | 0 | تعداد نمونههای ضبط شده |
| `created_at` | TIMESTAMPTZ | NO | NOW() | تاریخ اولین ثبت |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | تاریخ آخرین بروزرسانی |

### Foreign Keys:

```sql
ALTER TABLE voice_enrollment
  ADD CONSTRAINT voice_enrollment_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

### Triggers:

```sql
CREATE TRIGGER trg_voice_enrollment_updated_at
BEFORE UPDATE ON public.voice_enrollment
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```

### مثال داده:

```sql
INSERT INTO voice_enrollment 
  (user_id, enrollment_version, embedding_json, sample_count)
VALUES 
  ('123e4567-e89b-12d3-a456-426614174000', 1, '[0.12, 0.34, ...]', 5);
```

---

## 📋 6. forgotten_key_products

**هدف:** ثبت کالاهای فراموش شده در هر مذاکره.

**Migration:** موجود (قبلی)

### Schema:

```sql
CREATE TABLE IF NOT EXISTS public.forgotten_key_products (
  id SERIAL PRIMARY KEY,
  user_id uuid NOT NULL,
  customer_id INT,
  product_id INT NOT NULL,
  voice_log_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `id` | SERIAL | NO | AUTO | شناسه یکتا |
| `user_id` | uuid | NO | - | شناسه فروشنده |
| `customer_id` | INT | YES | NULL | شناسه مشتری |
| `product_id` | INT | NO | - | شناسه محصول فراموش شده |
| `voice_log_id` | INT | YES | NULL | ارجاع به مذاکره |
| `created_at` | TIMESTAMPTZ | NO | NOW() | تاریخ ثبت |

### Foreign Keys:

```sql
ALTER TABLE forgotten_key_products
  ADD CONSTRAINT forgotten_key_products_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE forgotten_key_products
  ADD CONSTRAINT forgotten_key_products_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
```

### Indexes:

```sql
CREATE INDEX IF NOT EXISTS forgotten_key_products_user_id_idx 
  ON public.forgotten_key_products (user_id);

CREATE INDEX IF NOT EXISTS forgotten_key_products_product_id_idx 
  ON public.forgotten_key_products (product_id);

CREATE INDEX IF NOT EXISTS forgotten_key_products_created_at_idx 
  ON public.forgotten_key_products (created_at DESC);
```

---

## 📋 7. negotiation_analysis_reports

**هدف:** ذخیره گزارشات تحلیل مذاکره.

**Migration:** `012_negotiation_analysis_reports_schema.sql` + تکمیل در `018`

### Schema (تکمیل شده):

```sql
CREATE TABLE IF NOT EXISTS public.negotiation_analysis_reports (
  id SERIAL PRIMARY KEY,
  created_by_user_id INT NOT NULL REFERENCES users(id),
  customer_code TEXT,
  customer_name TEXT,
  customer_industry_id INT REFERENCES customer_industries(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_accuracy DOUBLE PRECISION,
  address_auto TEXT,
  address_final TEXT,
  transcript_text TEXT,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  weakness_focus TEXT,
  exercises JSONB,
  missed_strategic_products JSONB,
  manager_summary_25 TEXT,
  manager_key_points JSONB,
  telegram_voice_file_id TEXT,  -- ✅ جدید
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### ستونهای کلیدی:

| ستون | نوع | Nullable | توضیحات |
|------|-----|----------|---------|
| `customer_code` | TEXT | YES | کد یکتای مشتری |
| `customer_name` | TEXT | YES | نام مشتری |
| `customer_industry_id` | INT | YES | شناسه صنف مشتری |
| `location_lat` | DOUBLE PRECISION | YES | عرض جغرافیایی |
| `location_lng` | DOUBLE PRECISION | YES | طول جغرافیایی |
| `transcript_text` | TEXT | YES | متن مذاکره (STT) |
| `score` | INT | NO | امتیاز 0-100 |
| `missed_strategic_products` | JSONB | YES | لیست کالاهای فراموش شده |
| `telegram_voice_file_id` | TEXT | YES | **🆕 شناسه فایل در تلگرام** |

### Indexes:

```sql
CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_created_user_idx
  ON public.negotiation_analysis_reports (created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_customer_code_idx
  ON public.negotiation_analysis_reports (customer_code);

CREATE INDEX IF NOT EXISTS idx_nar_telegram_file 
  ON public.negotiation_analysis_reports (telegram_voice_file_id);
```

---

## 📋 8. product_industries (🆕 جدید)

**هدف:** ارتباط Many-to-Many بین محصولات و صنایع.

**Migration:** `018_training_module_enhancements.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `id` | SERIAL | NO | AUTO | شناسه یکتا |
| `product_id` | INT | NO | - | شناسه محصول |
| `industry_id` | INT | NO | - | شناسه صنعت |
| `is_strategic` | BOOLEAN | NO | FALSE | آیا برای این صنف استراتژیک است؟ |
| `priority` | INT | NO | 1 | اولویت نمایش/یادآوری |
| `created_at` | TIMESTAMPTZ | NO | NOW() | تاریخ ایجاد |

### Constraints:

```sql
-- یکتایی: هر محصول فقط یکبار برای هر صنف
ALTER TABLE product_industries
  ADD CONSTRAINT product_industries_product_industry_uniq
  UNIQUE (product_id, industry_id);
```

### Foreign Keys:

```sql
ALTER TABLE product_industries
  ADD CONSTRAINT product_industries_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE product_industries
  ADD CONSTRAINT product_industries_industry_id_fkey
  FOREIGN KEY (industry_id) REFERENCES customer_industries(id) ON DELETE CASCADE;
```

### Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_product_industries_product 
  ON product_industries(product_id);

CREATE INDEX IF NOT EXISTS idx_product_industries_industry 
  ON product_industries(industry_id);

CREATE INDEX IF NOT EXISTS idx_product_industries_strategic 
  ON product_industries(industry_id, is_strategic) 
  WHERE is_strategic = TRUE;
```

### مثال داده:

```sql
-- روغن X برای رستورانها استراتژیک است
INSERT INTO product_industries 
  (product_id, industry_id, is_strategic, priority)
VALUES 
  (101, 5, TRUE, 1);  -- product_id=101, industry_id=5 (رستوران)

-- نوشابه Y برای سوپرمارکتها هم استراتژیک است
INSERT INTO product_industries 
  (product_id, industry_id, is_strategic, priority)
VALUES 
  (102, 5, TRUE, 2),
  (102, 8, TRUE, 1);
```

---

## 📋 9. customer_visit_summary (🆕 جدید)

**هدف:** Cache خلاصه مراجعات برای سرعت بالا.

**Migration:** `018_training_module_enhancements.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `customer_code` | TEXT | NO | - | کد مشتری (PK) |
| `customer_name` | TEXT | NO | - | نام مشتری |
| `last_visit_date` | TIMESTAMPTZ | YES | NULL | تاریخ آخرین مراجعه |
| `total_visits` | INT | NO | 0 | تعداد کل مراجعات |
| `last_seller_id` | uuid | YES | NULL | آخرین فروشنده |
| `avg_score` | NUMERIC(5,2) | YES | NULL | میانگین امتیاز |
| `total_forgotten_count` | INT | NO | 0 | تعداد کل کالاهای فراموش شده |
| `most_forgotten_products` | JSONB | YES | NULL | Top 3 کالای فراموش شده |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | تاریخ آخرین بروزرسانی |

### Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_cvs_last_visit 
  ON customer_visit_summary(last_visit_date DESC);

CREATE INDEX IF NOT EXISTS idx_cvs_customer_name 
  ON customer_visit_summary USING gin(to_tsvector('simple', customer_name));
```

### Trigger (بروزرسانی خودکار):

```sql
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

CREATE TRIGGER trg_update_customer_visit_summary
AFTER INSERT ON negotiation_analysis_reports
FOR EACH ROW
EXECUTE FUNCTION update_customer_visit_summary();
```

---

## 📋 10. manager_performance_cache (🆕 جدید)

**هدف:** کش عملکرد مدیران برای Dashboard سریع.

**Migration:** `018_training_module_enhancements.sql`

### Schema:

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

### ستونها:

| ستون | نوع | Nullable | Default | توضیحات |
|------|-----|----------|---------|---------|
| `manager_id` | uuid | NO | - | شناسه مدیر (PK) |
| `team_avg_score` | NUMERIC(10,2) | YES | NULL | میانگین امتیاز تیم |
| `total_visits` | INT | NO | 0 | تعداد کل ویزیتهای تیم |
| `success_rate` | NUMERIC(5,2) | YES | NULL | درصد موفقیت (score >= 70) |
| `total_forgotten` | INT | NO | 0 | تعداد کل کالاهای فراموش شده |
| `calculated_at` | TIMESTAMPTZ | NO | NOW() | تاریخ محاسبه |

### Foreign Keys:

```sql
ALTER TABLE manager_performance_cache
  ADD CONSTRAINT manager_performance_cache_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE;
```

### Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_mpc_score 
  ON manager_performance_cache(team_avg_score DESC);
```

### بروزرسانی (Cron Job شبانه):

```sql
-- محاسبه متریکها برای یک مدیر
SELECT 
  COUNT(*) AS total_visits,
  AVG(nar.score)::numeric(10,2) AS team_avg_score,
  (COUNT(*) FILTER (WHERE nar.score >= 70)::float / NULLIF(COUNT(*), 0) * 100)::numeric(5,2) AS success_rate,
  SUM(jsonb_array_length(COALESCE(nar.missed_strategic_products, '[]'::jsonb))) AS total_forgotten
FROM negotiation_analysis_reports nar
JOIN users u ON u.id = nar.created_by_user_id
WHERE u.manager_id = $1
  AND nar.created_at >= NOW() - INTERVAL '30 days';
```

---

## 🔧 Functions

### calculate_distance (Haversine)

**هدف:** محاسبه فاصله GPS بین دو نقطه.

```sql
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  R CONSTANT DOUBLE PRECISION := 6371000;  -- شعاع زمین (متر)
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
  
  RETURN R * c;  -- خروجی به متر
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**استفاده:**

```sql
-- یافتن مشتریان در شعاع 50 متر
SELECT 
  customer_code,
  customer_name,
  calculate_distance(35.6892, 51.3890, location_lat, location_lng) AS distance_m
FROM customers
WHERE calculate_distance(35.6892, 51.3890, location_lat, location_lng) <= 50
ORDER BY distance_m ASC;
```

---

## 📊 نمودار روابط (ERD)

```
┌─────────────────────┐
│ users               │
│ - id (uuid PK)      │
└──────┬──────────────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
       ▼                                     ▼
┌─────────────────────┐            ┌─────────────────────┐
│ user_training_state │            │ training_scores     │
│ - user_id (PK, FK)  │            │ - user_id (FK)      │
│ - user_level        │            │ - topic_key         │
│ - difficulty_level  │            │ - score (0-100)     │
│ - baseline_done     │            └─────────────────────┘
│ - current_topic_key │
└─────────────────────┘
       │
       │ relates to
       ▼
┌─────────────────────┐
│ training_topics     │
│ - topic_key (UK)    │
│ - title             │
│ - order_index       │
│ - prompt_*          │
└─────────────────────┘

┌─────────────────────┐          ┌─────────────────────┐
│ products            │◄─────────│ product_industries  │
│ - id (PK)           │ M     N  │ - product_id (FK)   │
└─────────────────────┘          │ - industry_id (FK)  │
                                 │ - is_strategic      │
                                 └─────────────────────┘
                                          │
                                          │ N
                                          ▼ M
                                 ┌─────────────────────┐
                                 │customer_industries  │
                                 │ - id (PK)           │
                                 └─────────────────────┘

┌──────────────────────────────┐
│ negotiation_analysis_reports │
│ - customer_code (indexed)    │───┐
│ - missed_strategic_products  │   │ AFTER INSERT
│ - telegram_voice_file_id     │   │ Trigger
└──────────────────────────────┘   │
                                   ▼
                          ┌─────────────────────┐
                          │customer_visit_summary│
                          │ - customer_code (PK) │
                          │ - total_visits       │
                          │ - avg_score          │
                          └─────────────────────┘
```

---

## ✅ Checklist Migration

- [ ] اجرای `005_training_priority_engine.sql` (اگر قبلاً نشده)
- [ ] اجرای `012_negotiation_analysis_reports_schema.sql`
- [ ] اجرای `018_training_module_enhancements.sql`
- [ ] تست Trigger `update_customer_visit_summary`
- [ ] تست Function `calculate_distance`
- [ ] بررسی Indexes با `EXPLAIN ANALYZE`

---

## 📌 Document Metadata

- **Created**: 2025-12-27
- **Author**: smkhadivpoor
- **Version**: 1.0
- **Status**: Complete Schema Documentation
