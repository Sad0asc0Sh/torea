-- Automation AI Settings Tables
-- جداول مجزا برای تنظیمات هوش مصنوعی ماژول اتوماسیون اداری

BEGIN;

-- 1. جدول تنظیمات اصلی API (singleton pattern)
CREATE TABLE IF NOT EXISTS public.automation_ai_settings (
  id SERIAL PRIMARY KEY,
  provider_type VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (provider_type IN ('local', 'cloud', 'hybrid')),
  base_url TEXT,
  api_key TEXT,
  model_name VARCHAR(100),
  max_tokens INTEGER DEFAULT 500,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  timeout_seconds INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE automation_ai_settings IS 'تنظیمات API هوش مصنوعی برای فرمت کردن متنهای اتوماسیون اداری';
COMMENT ON COLUMN automation_ai_settings.provider_type IS 'نوع سرویس: local (مثل Ollama), cloud (مثل OpenAI), hybrid';
COMMENT ON COLUMN automation_ai_settings.base_url IS 'آدرس API - مثال: http://localhost:11434/api/generate';
COMMENT ON COLUMN automation_ai_settings.api_key IS 'کلید API (در صورت نیاز برای cloud providers)';
COMMENT ON COLUMN automation_ai_settings.model_name IS 'نام مدل - مثال: llama2, gpt-3.5-turbo';

-- Singleton constraint: فقط یک ردیف تنظیمات
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_ai_settings_singleton 
  ON automation_ai_settings ((1));

-- 2. جدول قالبهای Prompt برای سه نوع سند
CREATE TABLE IF NOT EXISTS public.automation_ai_prompts (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('request', 'announcement', 'referral')),
  prompt_template TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_type)
);

COMMENT ON TABLE automation_ai_prompts IS 'قالبهای prompt برای فرمت کردن انواع مختلف اسناد اداری';
COMMENT ON COLUMN automation_ai_prompts.prompt_template IS 'متن prompt با placeholders: {topic_title}, {draft_template}, {transcript_text}';

-- 3. Function و Trigger برای بروزرسانی خودکار updated_at
CREATE OR REPLACE FUNCTION update_automation_ai_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_automation_ai_settings_updated_at ON automation_ai_settings;
CREATE TRIGGER trg_automation_ai_settings_updated_at
  BEFORE UPDATE ON automation_ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_ai_updated_at();

DROP TRIGGER IF EXISTS trg_automation_ai_prompts_updated_at ON automation_ai_prompts;
CREATE TRIGGER trg_automation_ai_prompts_updated_at
  BEFORE UPDATE ON automation_ai_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_ai_updated_at();

-- 4. دادههای پیشفرض: قالبهای prompt برای سه نوع سند
INSERT INTO automation_ai_prompts (item_type, prompt_template, description) VALUES

('request', 'تو یک دستیار هوشمند اداری هستی که به فارسی صحبت میکنی. 

موضوع: {topic_title}
نوع سند: درخواست اداری
قالب پیشنهادی: {draft_template}

متن گفتار کاربر: 
"{transcript_text}"

لطفاً این متن را بهصورت رسمی و مناسب برای یک درخواست اداری بازنویسی کن.
- از لحن محترمانه و رسمی استفاده کن
- ساختار منظم و واضح داشته باش
- فقط متن نهایی را برگردان، بدون توضیح اضافه', 'قالب پیشفرض برای درخواستهای اداری'),

('announcement', 'تو یک دستیار هوشمند اداری هستی که به فارسی صحبت میکنی.

موضوع: {topic_title}
نوع سند: ابلاغ اداری
قالب پیشنهادی: {draft_template}

متن گفتار کاربر:
"{transcript_text}"

لطفاً این متن را بهصورت رسمی و مناسب برای یک ابلاغ اداری بازنویسی کن.
- از لحن قاطع و رسمی استفاده کن
- ساختار واضح و دستوری داشته باش
- فقط متن نهایی را برگردان، بدون توضیح اضافه', 'قالب پیشفرض برای ابلاغیهها'),

('referral', 'تو یک دستیار هوشمند اداری هستی که به فارسی صحبت میکنی.

موضوع: {topic_title}
نوع سند: ارجاع اداری
قالب پیشنهادی: {draft_template}

متن گفتار کاربر:
"{transcript_text}"

لطفاً این متن را بهصورت رسمی و مناسب برای یک ارجاع اداری بازنویسی کن. 
- از لحن محترمانه و رسمی استفاده کن
- مشخص کن چه موضوعی به چه کسی ارجاع میشود
- فقط متن نهایی را برگردان، بدون توضیح اضافه', 'قالب پیشفرض برای ارجاعات')

ON CONFLICT (item_type) DO NOTHING;

-- 5. ایندکس برای جستجوی سریع
CREATE INDEX IF NOT EXISTS idx_automation_ai_prompts_type_active 
  ON automation_ai_prompts(item_type) WHERE is_active = TRUE;

COMMIT;
