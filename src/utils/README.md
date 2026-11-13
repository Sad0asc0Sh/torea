# Utils Directory

این پوشه برای قرار دادن توابع کمکی (utility functions) و ابزارهای مشترک طراحی شده است.

## هدف

متمرکز کردن helper functions و جلوگیری از تکرار کد در پروژه.

## وضعیت فعلی

در حال حاضر این پوشه شامل:
- `names.js`: توابع کمکی برای کار با نام‌ها
- `number.js`: توابع format و parse اعداد و ارقام فارسی/لاتین

## ساختار پیشنهادی برای آینده

```
src/utils/
├── names.js              # ✅ موجود - کار با نام‌ها
├── number.js             # ✅ موجود - format و parse اعداد
├── validators.js         # Validation helpers (email, phone, etc.)
├── formatters.js         # Date, currency, text formatting
├── constants.js          # Application constants
├── helpers.js            # General purpose helpers
├── telegramOtp.js        # ✅ در ریشه موجود - باید اینجا منتقل شود
└── README.md             # این فایل
```

## انواع Utils

### 1. Validators
توابعی برای validation ورودی‌ها:
```javascript
function isValidEmail(email) { ... }
function isValidPhone(phone) { ... }
function isValidNationalId(nationalId) { ... }
```

### 2. Formatters
توابعی برای format کردن داده‌ها برای نمایش:
```javascript
function formatDate(date, locale) { ... }
function formatCurrency(amount) { ... }
function truncateText(text, maxLength) { ... }
```

### 3. Constants
مقادیر ثابت برنامه:
```javascript
const USER_ROLES = { ADMIN: 'ADMIN', USER: 'USER', ... };
const HTTP_STATUS = { OK: 200, NOT_FOUND: 404, ... };
```

### 4. Helpers
توابع عمومی:
```javascript
function sleep(ms) { ... }
function generateRandomCode() { ... }
function sanitizeInput(input) { ... }
```

## اصول طراحی

1. **Pure Functions**: utils باید pure functions باشند (بدون side effects)
2. **Single Purpose**: هر تابع یک کار مشخص انجام دهد
3. **Reusable**: قابل استفاده در قسمت‌های مختلف برنامه
4. **Well Tested**: باید unit test داشته باشند
5. **Well Named**: نام توابع باید واضح و توصیفی باشد

## مثال استفاده

```javascript
// در هر جای برنامه
const { formatMoneyEn, parseNumberLoose } = require('./utils/number');
const { makeFullName } = require('./utils/names');

const amount = parseNumberLoose('۱۲۳۴۵۶');
const formatted = formatMoneyEn(amount);
const name = makeFullName('علی', 'احمدی');
```

## کارهای آتی

برای بهبود این پوشه:

1. **انتقال توابع پراکنده**: 
   - `telegramOtp.js` از src/ به utils/
   - سایر helper functions از app.js و سایر فایل‌ها

2. **سازماندهی بهتر**:
   - جداسازی validators به فایل جداگانه
   - جداسازی formatters به فایل جداگانه

3. **تست**:
   - نوشتن unit tests برای همه utils
   - اطمینان از coverage بالا

4. **مستندسازی**:
   - JSDoc برای همه توابع
   - مثال‌های استفاده

## توجه

Utils نباید:
- Business logic داشته باشند
- به database دسترسی داشته باشند
- State نگه دارند
- از سایر لایه‌های برنامه استفاده کنند (به جز config)

Utils باید:
- Pure و predictable باشند
- خوب تست شده باشند
- خوب مستندسازی شده باشند
- Performance بالا داشته باشند
