# To Infinity

سامانه مدیریت فروش و اعتبار

## ساختار پروژه

```
ToInfinity/
├── src/
│   ├── config/              # تنظیمات برنامه (database, env)
│   │   └── db.js
│   ├── models/              # 🆕 لایه Data Access (آینده)
│   │   └── README.md        # مستندات models
│   ├── services/            # Business Logic
│   │   ├── auth.service.js
│   │   ├── catalog.service.js
│   │   ├── systemAdmin.service.js
│   │   └── ...
│   ├── middlewares/         # ✅ یکپارچه‌شده
│   │   ├── auth.js
│   │   ├── systemAdmin.js
│   │   ├── guards.js
│   │   ├── catalogAccess.js
│   │   ├── flowGuards.js
│   │   └── adminLocals.js
│   ├── routes/              # ✅ سازماندهی شده بر اساس Domain
│   │   ├── admin/
│   │   │   ├── index.js
│   │   │   ├── pages.routes.js
│   │   │   ├── users.routes.js      # 🆕 منتقل شده
│   │   │   ├── system.routes.js     # 🆕 منتقل شده
│   │   │   ├── balance/
│   │   │   ├── definitions/
│   │   │   ├── settings/
│   │   │   └── tools/
│   │   ├── auth/
│   │   ├── register/
│   │   ├── telegram/
│   │   ├── user/
│   │   └── modules/                  # 🆕 ماژول‌های کاربری
│   │       ├── credit/
│   │       │   ├── sale.routes.js
│   │       │   └── settlement.routes.js
│   │       ├── customers.routes.js
│   │       └── reports.routes.js
│   ├── views/
│   │   ├── layouts/                  # 🆕 Layout templates (آینده)
│   │   │   ├── README.md
│   │   │   ├── admin.ejs
│   │   │   ├── user.ejs
│   │   │   └── auth.ejs
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── user/
│   │   └── partials/
│   ├── public/
│   │   ├── css/
│   │   ├── js/
│   │   └── icons/
│   ├── utils/
│   │   ├── README.md
│   │   ├── names.js
│   │   ├── number.js
│   │   └── telegramOtp.js
│   ├── catalog/
│   ├── reports/
│   ├── scripts/
│   ├── app.js
│   └── server.js
├── test/                             # 🆕 فایل‌های تست خارج از src
│   ├── unit/
│   │   ├── app/                      # تست‌های app.js
│   │   ├── routes/                   # تست‌های routes
│   │   │   ├── admin/
│   │   │   │   ├── balance/
│   │   │   │   └── definitions/
│   │   │   ├── telegram/
│   │   │   ├── credit-sale.test.js
│   │   │   ├── credit-settlement.test.js
│   │   │   └── system-admin.test.js
│   │   ├── services/                 # تست‌های services
│   │   └── utils/                    # تست‌های utils
│   └── integration/                  # آینده
├── migrations/                       # Database migrations
├── scripts/                          # اسکریپت‌های کمکی
├── docs/                             # مستندات
├── package.json
└── README.md                         # این فایل
```

## تغییرات اخیر (Refactoring)

### ✅ انجام شده

1. **یکپارچه‌سازی Middlewares**
   - حذف پوشه تکراری `src/middleware/`
   - تمام middlewares در `src/middlewares/` قرار دارند

2. **سازماندهی Test Files**
   - تمام فایل‌های تست به `test/unit/` منتقل شدند
   - ساختار سلسله‌مراتبی بر اساس ماژول‌ها
   - جداسازی از کد اصلی برنامه

3. **سازماندهی Routes**
   - routes مدیریتی در `routes/admin/`
   - routes ماژول‌های کاربری در `routes/modules/`
   - ساختار واضح و قابل توسعه

### 🚧 آماده برای پیاده‌سازی

4. **Views Layouts**
   - پوشه `src/views/layouts/` ایجاد شده
   - Template های نمونه آماده
   - نیاز به migration از partials

5. **Models Layer**
   - پوشه `src/models/` ایجاد شده
   - مستندات کامل
   - نیاز به استخراج queries از services

6. **Utils Organization**
   - پوشه `src/utils/` موجود
   - مستندات اضافه شده
   - نیاز به consolidation توابع پراکنده

## نصب و راه‌اندازی

```bash
# نصب dependencies
npm install

# اجرای برنامه
npm start

# اجرای تست‌ها
npm test

# اجرای تست‌های unit
npm run test:unit
```

## متغیرهای محیطی

```env
DATABASE_URL=postgres://user:pass@localhost:5432/dbname
SESSION_SECRET=your-secret-key-here
NODE_ENV=production|development|test
SESSION_STORE=memory|pg
THEME_DISABLED=true|false
SOFTWARE_LICENSE_KEY=optional-license-key
```

## اصول معماری

### Layered Architecture

1. **Routes**: مسیریابی و validation ورودی
2. **Services**: Business logic و orchestration
3. **Models** (آینده): Data access و database queries
4. **Middlewares**: Authentication, authorization, logging
5. **Utils**: Helper functions و constants

### Best Practices

- ✅ استفاده از `git mv` برای حفظ history
- ✅ جداسازی concerns (SoC)
- ✅ Single Responsibility Principle
- ✅ DRY (Don't Repeat Yourself)
- ✅ Testing و test coverage
- ✅ مستندسازی کد و API

## تست‌ها

تست‌ها با استفاده از Node.js built-in test runner نوشته شده‌اند:

```bash
# اجرای همه تست‌ها
npm test

# اجرای تست‌های unit
npm run test:unit

# اجرای تست‌های خاص
node --test test/unit/services/auth.service.test.js
```

## مشارکت

برای مشارکت در پروژه:

1. از ساختار فعلی پیروی کنید
2. برای هر feature تست بنویسید
3. کد را مستندسازی کنید
4. از git mv برای انتقال فایل‌ها استفاده کنید

## لایسنس

ISC

## نکات مهم

- همیشه `git mv` برای انتقال فایل‌ها استفاده کنید
- تست‌ها را پس از هر تغییر اجرا کنید
- مستندات را به‌روز نگه دارید
- از relative imports صحیح استفاده کنید
- ساختار layered architecture را رعایت کنید
