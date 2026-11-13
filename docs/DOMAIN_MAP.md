# DOMAIN_MAP — ToInfinity

**Note:** This document provides a high-level domain overview. For **complete, current architecture details**, see **[ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md)**.

---

## 0) هدف پروژه
پلتفرم عمومی برای شرکت‌هایی با فروش حضوری/مویرگی/اعتباری (بدون محدودیت صنعتی) که تمام تعریف‌ها توسط خود شرکت تنظیم می‌شود.

**فناوری:** Node.js + Express + EJS + PostgreSQL (نه React/Vite)

## 1) نقش‌ها (Roles)

### سیستم احراز هویت دوگانه:

#### 1. System Admins (ادمین‌های سیستم)
- جدول: `system_admins` (جدا از users)
- مسیر ورود: `/admin/login`
- Cookie: `toinf_admin_sid`
- دسترسی به: `/admin/*`
- نقش در سشن: `SYSTEM_ADMIN`

#### 2. Regular Users (کاربران عادی)
- جدول: `users`
- مسیر ورود: `/login`
- Cookie: default Express session
- دسترسی به: `/`, `/credit-sale/*`, `/customers`, etc.
- نقش‌ها:
  - `USER`: کاربر عادی (فروشنده/کارمند)
  - `ADMIN`: Legacy (redirect به admin login)
  - `SUPER_ADMIN`: Legacy (redirect به admin login)

### نقش‌های سازمانی (از طریق org_nodes):
- SalesRep, Supervisor, Manager, SeniorManager, Finance, Collector, Trainer, ...
- نقش‌ها از طریق `org_nodes` تعریف می‌شوند
- هر کاربر به یک `org_node_id` متصل است

**جزئیات بیشتر:** [ARCHITECTURE_CURRENT.md - Authentication](./ARCHITECTURE_CURRENT.md#authentication--authorization)

## 2) وضعیت‌های کاربر (User Status)
- `pending_verification`: ثبت‌نام انجام شده، کد تلگرام باید تایید شود
- `active`: تایید شده و فعال
- `NEEDS_EDIT`: کاربر نیمه‌کاره یا نیازمند تکمیل اطلاعات
- `rejected`: رد شده
- `pending_*`: سایر وضعیت‌های در انتظار
- فیلد `active` (boolean): کنترل دسترسی

### جریان احراز (Auth Flow)

#### User Flow:
1. `/login` یا `/register`
2. `/pre-register-info` → `/register`
3. `/auth/telegram` (ارسال و تایید کد)
4. Status: `pending_verification` → `active` (پس از تایید)
5. ورود به داشبورد

#### System Admin Flow:
1. `/admin/login`
2. `/admin/verify` (Telegram OTP)
3. اگر اولین بار: `/admin/first-setup`
4. ورود به `/admin/dashboard`

**جزئیات بیشتر:** [ARCHITECTURE_CURRENT.md - Authentication](./ARCHITECTURE_CURRENT.md#authentication--authorization)

## 3) ماژول‌ها (Modules)

### 3.1 احراز هویت و ورود

#### User Routes:
- `GET/POST /login` - ورود کاربر
- `GET /logout` - خروج کاربر
- `GET/POST /register` - ثبت‌نام کاربر
- `GET /pre-register-info` - اطلاعات قبل از ثبت‌نام
- `GET/POST /auth/telegram` - احراز تلگرامی

#### System Admin Routes:
- `GET/POST /admin/login` - ورود ادمین سیستم
- `GET/POST /admin/verify` - تایید OTP
- `GET/POST /admin/first-setup` - راه‌اندازی اولیه
- `GET /admin/logout` - خروج ادمین

Views:
- `login.ejs`, `register.ejs`, `pre_register_info.ejs`
- `telegram_auth.ejs`, `pending.ejs`
- `system_admin_login.ejs`, `system_admin_verify.ejs`, `system_admin_first_setup.ejs`

**جزئیات:** [ARCHITECTURE_CURRENT.md - Route Map](./ARCHITECTURE_CURRENT.md#route-map)

### 3.2 ساختار سازمانی (Org Hierarchy)
هدف: تعریف سلسله‌مراتب (org_nodes) + اتصال کاربران + تعیین مدیران

Routes:
- `/admin/definitions/hierarchy` - مدیریت nodes (لیست/ایجاد/ویرایش/حذف)
- `/admin/definitions/hierarchy/arrange` - چیدمان روابط parent-child
- `/admin/definitions/hierarchy/link` - POST: به‌روزرسانی parent_id (با چک loop)

Views:
- `admin_hierarchy.ejs`
- `admin_hierarchy_arrange.ejs`

**Legacy redirect:** `/admin/definitions/org-nodes*` → 301 به `/hierarchy`

### 3.3 تیم‌ها (Teams)
Routes:
- `/admin/definitions/teams` - لیست تیم‌ها
- `/admin/definitions/teams/:id/members` - مدیریت اعضا
- `/admin/definitions/teams/:id/brands` - تخصیص برندها

Views: `definitions/teams.ejs`, `admin_def_team_form.ejs`, `admin_def_team_members.ejs`, `admin_def_team_brands.ejs`

**جزئیات:** [ARCHITECTURE_CURRENT.md - Definitions Module](./ARCHITECTURE_CURRENT.md#definitions-module)

### 3.4 برندها (Brands)
Routes:
- `/admin/definitions/brands` - لیست برندها
- `/admin/definitions/brands/new` - ایجاد برند
- `/admin/definitions/brands/:id/edit` - ویرایش برند

Views: `definitions/brands.ejs`, `admin_def_brand_form.ejs`

### 3.5 محصولات (Products)
Routes:
- `/admin/definitions/products` - لیست محصولات (با filter و pagination)
- `/admin/definitions/products/new` - ایجاد محصول
- `/admin/definitions/products/import` - POST: ایمپورت Excel/CSV
- `/admin/definitions/products/template.xlsx` - دانلود قالب Excel

Views: `definitions/products.ejs`, `admin_def_product_form.ejs`

### 3.6 سیاست اعتباری (Credit Policy)
Routes:
- `/admin/definitions/credit-policy` - لیست policies per org_node
- `/admin/definitions/credit-policy/:nodeId` - ویرایش policy

Views: `admin_def_credit_policy.ejs`, `admin_def_credit_policy_form.ejs`

### 3.7 مدیریت کاربران (User Management)
Routes:
- `/admin/definitions/users` - لیست کاربران (تعاریف)
- `/admin/users` - مدیریت کامل کاربران

Views: `admin_def_users.ejs`, `admin_def_user_edit.ejs`, `admin_users.ejs`, `admin_user_edit.ejs`

### 3.8 فروش اعتباری (Credit Sale) - User Flow
Routes:
- `/credit-sale/list` - لیست فروش‌ها
- `/credit-sale/new` - ایجاد فروش جدید
- `/credit-sale/:id` - جزئیات فروش

Views: `credit_sale_list.ejs`, `credit_sale_new.ejs`, `credit_sale_detail.ejs`

### 3.9 تسویه (Credit Settlement) - User Flow
Routes:
- `/credit-settlement/inbox` - صندوق ورودی تسویه‌ها
- `/credit-settlement/new` - ایجاد تسویه جدید

Views: `credit_settlement_inbox.ejs`, `credit_settlement_new.ejs`

### 3.10 ضبط ویس مذاکره (Voice Capture) - برنامه‌ریزی شده
(طبق Spec باید اضافه شود)
- قوانین: «تمام ارتباطات داخلی فقط با ویس»
- محل آپلود/ذخیره: (Pending)

### 3.11 تحلیل هوش مصنوعی (AI Analysis) - برنامه‌ریزی شده
(طبق Spec باید اضافه شود)
- ورودی: فایل صوتی
- خروجی: نمره 0-100 + نقاط ضعف + تمرین روزانه
- ثبت نتایج در DB + گزارش‌گیری

### 3.12 گزارشات (Reports)
Routes:
- `/admin/reports` - داشبورد گزارشات

Views: `admin_reports.ejs`

(باید دسته‌بندی ۴گانه از Spec استخراج شود - در حال توسعه)

### 3.13 تنظیمات (Settings)
Views:
- `system_admin_first_setup.ejs` - راه‌اندازی اولیه (Telegram bot token)

جدول: `system_settings` (key-value store)

**لیست کامل routes:** [ARCHITECTURE_CURRENT.md - Route Map](./ARCHITECTURE_CURRENT.md#route-map)

## 4) معماری Backend / Frontend / Views

### Backend:
- **Routes:** `src/routes/*.js` - Express route handlers
- **Services:** `src/services/*.js` - Business logic & database access
- **Middlewares:** `src/middlewares/*.js` - Auth, guards, validation
- **Config:** `src/config/` - Database pool, environment config

### Frontend (Server-Side Rendering):
- **Templates:** `src/views/*.ejs` - EJS server-side templates
- **Layouts:** `src/views/partials/` - Reusable layout components
  - `layout_mobile.ejs` - Mobile-first layout (Admin + User)
  - `admin_layout.ejs` - Admin-specific layout (alternative)
- **Static Assets:**
  - CSS: `src/public/css/` - Mobile-first, RTL-aware
  - JS: `src/public/js/` - Minimal client-side scripts
  - Fonts: `src/public/fonts/vazir/` - Vazirmatn font
  - Icons: `src/public/icons/` - App logo and favicons

### Views Architecture:
```
src/views/
├── partials/
│   ├── layout_mobile.ejs    # Main layout wrapper
│   ├── admin_layout.ejs     # Admin alternative layout
│   └── pages/               # Content partials
├── definitions/             # Definitions module views
├── admin_*.ejs              # Admin full-page views
├── login.ejs, register.ejs  # User auth views
└── [other views]
```

**CSS Load Order:**
1. `app-mobile.css` (base)
2. `bria-theme.css` (shared theme)
3. `admin-theme.css` (admin colors) - if admin
4. `admin-ui.css` (admin components) - if admin
5. Page-specific CSS from `css/pages/`

**جزئیات:** [ARCHITECTURE_CURRENT.md - Views & CSS](./ARCHITECTURE_CURRENT.md#views--layout-architecture)

## 5) امنیت و کنترل دسترسی

### Middleware Chain:
1. **adminSession** - Admin session middleware (برای `/admin/*`)
2. **requireSystemAdmin** - بررسی admin در جدول `system_admins`
3. **requireLogin** - بررسی login کاربر عادی
4. **enforceRole([roles])** - بررسی نقش (USER, ADMIN, etc.)
5. **enforceStatus** - بررسی وضعیت و active flag

### محدودیت‌های امنیتی:
- ✅ تمام queryها از parameterized placeholders استفاده می‌کنند (`$1`, `$2`)
- ✅ بدون string concatenation در SQL queries
- ✅ CSRF protection via session (SameSite cookies)
- ✅ Session timeout: User=7 days, Admin=2 hours
- ✅ Password hashing: bcryptjs
- ✅ Telegram OTP برای احراز هویت
- ✅ Account locking برای admin (بعد از تلاش‌های ناموفق)

### قوانین دسترسی:
- `/admin/*`: فقط system admins
- User routes: `requireLogin` + `enforceRole` + `enforceStatus`
- Definitions: فقط system admins
- Credit sale/settlement: users با role=USER و status=active

**جزئیات:** [ARCHITECTURE_CURRENT.md - Middleware Stack](./ARCHITECTURE_CURRENT.md#middleware-stack)

---

## 6) پایگاه داده (Database)

جداول اصلی:
- `users` - کاربران عادی
- `system_admins` - ادمین‌های سیستم
- `org_nodes` - سلسله‌مراتب سازمانی
- `teams`, `user_team_assignment`, `team_users` - تیم‌ها و اعضا
- `brands`, `team_brands` - برندها و تخصیص به تیم
- `products` - محصولات
- `org_credit_policy` - سیاست‌های اعتباری
- `user_sessions`, `admin_sessions` - نگهداری session
- `system_settings` - تنظیمات کلیدی

**ERD کامل:** [ARCHITECTURE_CURRENT.md - Database Schema](./ARCHITECTURE_CURRENT.md#database-schema)

**مایگریشن‌ها:**
```bash
npm run db:patch  # اجرای تمام مایگریشن‌ها
```

---

## 7) چک‌لیست Regression Prevention

قبل از deploy:
- [ ] هیچ route با wildcard (`/path*`) وجود ندارد (جز orgNodes redirect)
- [ ] تمام SQL queries از parameterized placeholders استفاده می‌کنند
- [ ] Hierarchy arrange: چک loop فعال است
- [ ] Team members: UUID normalization فعال است
- [ ] Brand/Product toggle: هشدار وجود products/teams
- [ ] Import limits: max 5000 rows, 10MB enforced
- [ ] User display: `first_name + last_name` (نه `full_name`)
- [ ] CSS load order: base → theme → page-specific
- [ ] Tests: `npm test` موفق

**جزئیات:** [ARCHITECTURE_CURRENT.md - Regression Prevention](./ARCHITECTURE_CURRENT.md#regression-prevention-checklist)

---

## مراجع اصلی

- **[ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md)** - معماری کامل و دقیق
- **[DEFINITIONS_README.md](./DEFINITIONS_README.md)** - راهنمای ماژول Definitions
- **[README.md](./README.md)** - فهرست کلی مستندات
- **[DB_MAP.md](./DB_MAP.md)** - نقشه دیتابیس

---

**آخرین به‌روزرسانی:** 2025-12-21  
**وضعیت:** به‌روز و همسو با [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md)
