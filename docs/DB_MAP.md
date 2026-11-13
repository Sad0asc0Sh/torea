# DB_MAP — ToInfinity

**Note:** This document provides a high-level overview of key database tables. For the **complete, canonical database schema with ERD diagrams**, see **[ARCHITECTURE_CURRENT.md - Database Schema](./ARCHITECTURE_CURRENT.md#database-schema)**.

---

## High-Level Database Overview

## جدول users
فیلدهای اصلی:
- id UUID (PK)
- username TEXT (UNIQUE)
- first_name TEXT
- last_name TEXT
- phone TEXT
- telegram_id TEXT
- password_hash TEXT
- verification_code TEXT
- status TEXT (pending_verification / NEEDS_EDIT / active / rejected)
- role TEXT (USER / ADMIN / SUPER_ADMIN / SYSTEM_ADMIN)
- active BOOLEAN
- org_node_id INTEGER (FK → org_nodes.id)
- manager_id UUID (FK → users.id)
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

روابط:
- users.manager_id → users.id (self-reference - مدیر بالادست)
- users.org_node_id → org_nodes.id (سمت سازمانی)

ایندکس‌ها:
- UNIQUE(username)
- INDEX(org_node_id)
- INDEX(manager_id)
- INDEX(status)
- INDEX(active)

**Note:** User display uses `first_name + last_name` (not `full_name`).

## جدول org_nodes
سلسله‌مراتب سازمانی (سمت‌ها، نقش‌ها):
- id SERIAL (PK)
- title TEXT NOT NULL
- parent_id INTEGER (FK → org_nodes.id)
- level INTEGER (سطح در درخت)
- branch TEXT ('ORG' یا 'SYSTEM')
- created_at TIMESTAMPTZ

روابط:
- Self-referencing: parent_id → org_nodes.id
- یک node می‌تواند چندین child داشته باشد

## جدول system_admins
ادمین‌های سیستم (جدا از users):
- id SERIAL (PK)
- username TEXT UNIQUE NOT NULL
- telegram_id TEXT
- password_hash TEXT
- is_active BOOLEAN
- locked_until TIMESTAMPTZ
- must_change_password BOOLEAN
- created_at TIMESTAMPTZ

## جدول teams
تیم‌ها:
- id SERIAL (PK)
- name TEXT NOT NULL
- org_node_id INTEGER (FK → org_nodes.id)
- active BOOLEAN
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

ایندکس‌ها:
- UNIQUE(LOWER(name))
- INDEX(org_node_id)

## جدول user_team_assignment
تخصیص کاربر به تیم (one-to-one):
- user_id TEXT NOT NULL (UNIQUE)
- team_id INTEGER NOT NULL (FK → teams.id, ON DELETE CASCADE)
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

**محدودیت:** هر user فقط در یک team

## جدول team_users
جدول مشتق (trigger-managed از user_team_assignment):
- team_id INTEGER (FK → teams.id)
- user_id TEXT
- role TEXT (همیشه 'MEMBER')
- active BOOLEAN
- created_at TIMESTAMPTZ
- PRIMARY KEY (team_id, user_id)

## جدول brands
برندها:
- id SERIAL (PK)
- name TEXT NOT NULL (UNIQUE case-insensitive)
- code TEXT (UNIQUE, nullable)
- is_active BOOLEAN
- manager_user_id UUID (FK → users.id)
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

## جدول team_brands
تخصیص برند به تیم (many-to-many):
- team_id INTEGER (FK → teams.id, ON DELETE CASCADE)
- brand_id INTEGER (FK → brands.id, ON DELETE CASCADE)
- priority INTEGER
- PRIMARY KEY (team_id, brand_id)

## جدول products
محصولات:
- id SERIAL (PK)
- brand_id INTEGER NOT NULL (FK → brands.id, ON DELETE CASCADE)
- sku_code TEXT (UNIQUE, nullable)
- name TEXT NOT NULL
- aliases TEXT[]
- is_key BOOLEAN
- is_active BOOLEAN
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

ایندکس‌ها:
- UNIQUE(sku_code) WHERE sku_code IS NOT NULL
- UNIQUE(brand_id, LOWER(name))
- INDEX(brand_id)

## جدول org_credit_policy
سیاست‌های اعتباری per org_node:
- org_node_id INTEGER (PK, FK → org_nodes.id)
- approver1_node_id INTEGER (FK → org_nodes.id)
- approver2_node_id INTEGER (FK → org_nodes.id)
- finance_required BOOLEAN
- finance_user_id UUID (FK → users.id)
- max_open_invoices_per_user INTEGER
- max_open_amount_per_user NUMERIC
- max_open_invoices_per_customer INTEGER
- max_open_amount_per_customer NUMERIC
- max_invoice_amount NUMERIC
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

## جدول system_settings
تنظیمات سیستم (key-value):
- key TEXT (PK)
- value TEXT

نمونه کلیدها:
- `telegram_bot_token`
- `TELEGRAM_BOT_TOKEN`

## جداول Session
- **user_sessions**: سشن کاربران عادی
  - sid TEXT (PK)
  - sess JSON
  - expire TIMESTAMPTZ
  
- **admin_sessions**: سشن ادمین‌های سیستم
  - sid TEXT (PK)
  - sess JSON
  - expire TIMESTAMPTZ

## جداول دیگر (برنامه‌ریزی شده / بخشی پیاده‌سازی شده)
- **credit_sale_requests**: درخواست‌های فروش اعتباری (در حال پیاده‌سازی)
- **receivables**: مطالبات (برنامه‌ریزی شده)
- **voice_records**: ضبط مکالمات (برنامه‌ریزی شده)
- **ai_analysis_results**: نتایج تحلیل هوش مصنوعی (برنامه‌ریزی شده)

---

## دیاگرام ERD کامل

برای دیاگرام ERD کامل با تمام روابط، به این سند مراجعه کنید:  
**[ARCHITECTURE_CURRENT.md - Database Schema](./ARCHITECTURE_CURRENT.md#database-schema)**

---

## مایگریشن‌های دیتابیس

مایگریشن‌های SQL در پوشه `migrations/`:
- `000_fix_consistency.sql` - جداول teams و user_team_assignment
- `001_add_brand_manager.sql` - فیلد manager_user_id در brands
- `002_add_user_search_indexes.sql` - ایندکس‌های جستجوی users
- `003_add_team_users_indexes.sql` - ایندکس‌های team_users
- `004_fix_team_users_fks.sql` - اصلاح Foreign Keys

اجرای مایگریشن‌ها:
```bash
npm run db:patch
```

---

**نکته مهم:** این سند خلاصه‌ای از جداول است. برای اطلاعات کامل و دقیق، حتماً به [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md) مراجعه کنید.
