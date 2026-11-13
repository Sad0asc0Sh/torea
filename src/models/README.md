# Models Layer

این پوشه برای قرار دادن فایل‌های model طراحی شده است که مسئول تعامل با دیتابیس هستند.

## هدف

جداسازی database queries از business logic و ایجاد یک لایه Data Access واضح.

## اصول طراحی

1. **Single Responsibility**: هر model فقط مسئول یک entity است
2. **Pure Data Access**: models فقط باید query ها را اجرا کنند، نه business logic
3. **Reusability**: queries تکراری در models قرار می‌گیرند
4. **Testability**: model ها به راحتی قابل mock و test هستند

## ساختار پیشنهادی

```
src/models/
├── user.model.js              # CRUD عملیات کاربران
├── customer.model.js          # CRUD عملیات مشتریان
├── creditSale.model.js        # CRUD فروش اعتباری
├── creditSettlement.model.js  # CRUD تسویه اعتبار
├── brand.model.js             # CRUD برندها
├── product.model.js           # CRUD محصولات
├── team.model.js              # CRUD تیم‌ها
└── orgNode.model.js           # CRUD سلسله مراتب سازمانی
```

## مثال

```javascript
// user.model.js
const pool = require('../config/db');

async function findUserByUsername(username) {
  const result = await pool.query(
    'SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1))',
    [username]
  );
  return result.rows[0] || null;
}

async function createUser(userData) {
  const { username, password_hash, first_name, last_name, role } = userData;
  const result = await pool.query(
    `INSERT INTO users (username, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [username, password_hash, first_name, last_name, role]
  );
  return result.rows[0];
}

module.exports = {
  findUserByUsername,
  createUser,
  // ... other user queries
};
```

## نحوه استفاده

Services باید از models استفاده کنند، نه مستقیماً از pool:

```javascript
// ❌ قبل (در service):
const pool = require('../config/db');
const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

// ✅ بعد (در service):
const userModel = require('../models/user.model');
const user = await userModel.findUserByUsername(username);
```

## وضعیت فعلی

در حال حاضر، query ها در services پراکنده هستند. برای پیاده‌سازی models:

1. شناسایی query های تکراری در services
2. گروه‌بندی query ها بر اساس entity
3. ایجاد model files
4. استخراج query ها به models
5. بازنویسی services برای استفاده از models
6. حذف direct database access از services

## مزایا

- **Maintainability**: query ها در یک جا متمرکز هستند
- **Consistency**: همه services از یک query استفاده می‌کنند
- **Testing**: mock کردن models راحت‌تر از mock کردن pool است
- **Performance**: می‌توان caching و optimization را در models اعمال کرد
- **Security**: SQL injection prevention در یک لایه متمرکز

## پیاده‌سازی

این کار نیازمند:
- بررسی و شناسایی تمام query های موجود
- طراحی API مناسب برای هر model
- نوشتن unit tests برای models
- Migration تدریجی services

می‌تواند در PR جداگانه انجام شود.
