# راهنمای جامع اسکریپت واحدسازی کاتالوگ

## مقدمه

اسکریپت `unify_catalog_data.js` یک ابزار جامع برای پاکسازی و واحدسازی جدول `catalog_items` در دیتابیس است. این اسکریپت به شما کمک می‌کند تا:

- **داده‌های تکراری** را شناسایی و حذف کنید
- **ایتم‌های منسوخ شده** را غیرفعال کنید
- **ایتم‌های بی‌والد (orphan)** را شناسایی و رفع کنید
- **وابستگی‌های دایره‌ای (circular dependencies)** را تشخیص دهید
- **ترتیب‌بندی (order_index)** را نرمال کنید
- **آیکون‌های پیشفرض** را برای ایتم‌های بدون آیکون تنظیم کنید

## هدف

هدف اصلی این اسکریپت، پاکسازی و بهینه‌سازی جدول کاتالوگ است تا:

1. **یکپارچگی داده‌ها** را تضمین کند
2. **عملکرد سیستم** را بهبود بخشد
3. **مشکلات رابط کاربری** ناشی از داده‌های ناسازگار را برطرف کند
4. **تعمیر و نگهداری** را آسان‌تر کند

## پیشنیازها

### نرم‌افزارها
- **Node.js** نسخه 14 یا بالاتر
- **PostgreSQL** دیتابیس
- دسترسی به متغیر محیطی `DATABASE_URL`

### دسترسی‌ها
- دسترسی **خواندن و نوشتن** به جدول `catalog_items`
- دسترسی **ایجاد جدول موقت** (برای backup)

### قبل از اجرا
1. مطمئن شوید که **backup** کامل از دیتابیس دارید
2. **ترمینال دسترسی دیتابیس** را آماده کنید (در صورت نیاز به بازگردانی دستی)
3. در **محیط غیرتولید** ابتدا تست کنید

## ویژگی‌های ایمنی

### 1. Transaction-Safe
تمام عملیات درون یک تراکنش دیتابیس انجام می‌شود:
```sql
BEGIN;
-- all operations
COMMIT; -- or ROLLBACK on error
```

اگر خطایی رخ دهد، تمام تغییرات به‌صورت خودکار **برگردانده می‌شوند** (ROLLBACK).

### 2. Backup خودکار
قبل از هر تغییر، یک جدول backup موقت ایجاد می‌شود:
```javascript
catalog_items_backup_YYYY-MM-DDTHH-MM-SS
```

**نکته مهم**: این backup در جدول موقت (TEMP TABLE) ذخیره می‌شود و پس از قطع اتصال دیتابیس از بین می‌رود.

### 3. Dry-Run Mode
می‌توانید ابتدا تغییرات را **پیش‌نمایش** کنید:
```bash
node scripts/unify_catalog_data.js --dry-run
```

در این حالت، هیچ تغییری در دیتابیس ایجاد نمی‌شود و فقط گزارش نمایش داده می‌شود.

### 4. تأیید کاربر
قبل از اعمال تغییرات، از کاربر **تأیید** درخواست می‌شود (مگر با flag `--force`).

## راهنمای استفاده

### دستورات اصلی

#### 1. نمایش راهنما
```bash
node scripts/unify_catalog_data.js --help
```

#### 2. پیش‌نمایش تغییرات (Dry-Run)
```bash
node scripts/unify_catalog_data.js --dry-run
```

**پیشنهاد**: همیشه ابتدا در حالت dry-run اجرا کنید.

#### 3. اجرای واقعی با تأیید
```bash
node scripts/unify_catalog_data.js
```

#### 4. اجرای واقعی بدون تأیید
```bash
node scripts/unify_catalog_data.js --force
```

#### 5. نگه‌داشتن ایتم‌های قدیمی
```bash
node scripts/unify_catalog_data.js --keep-old
```

با این flag، ایتم‌های deprecated غیرفعال نمی‌شوند.

### فلوچارت اجرا

```
┌─────────────────────────┐
│  شروع اسکریپت          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  نمایش آمار اولیه      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  تأیید از کاربر        │
│  (اگر --force نباشد)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  BEGIN Transaction      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  ایجاد Backup          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  حذف تکراری‌ها          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  غیرفعال کردن منسوخ‌ها  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  رفع orphan ها          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  بررسی circular deps   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  نرمالسازی order_index │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  تنظیم آیکون پیشفرض    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  COMMIT یا ROLLBACK     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  نمایش آمار نهایی      │
└─────────────────────────┘
```

## توضیح عملیات‌ها

### 1. شناسایی و حذف تکراری‌ها

**مشکل**: ایتم‌هایی با `key` یکسان (اگر وجود داشته باشند).

**راه‌حل**: 
- شناسایی ایتم‌های با key تکراری
- حفظ جدیدترین نسخه (بر اساس `updated_at`)
- حذف نسخه‌های قدیمی‌تر

**نکته**: با توجه به PRIMARY KEY constraint، نباید تکراری وجود داشته باشد.

### 2. غیرفعال کردن منسوخ‌ها

**ایتم‌های منسوخ شده**:
```javascript
const DEPRECATED_KEYS = [
  'admin.settings.catalog',
  'admin.settings.catalog-access',
];

const DEPRECATED_ROUTE_PATTERNS = [
  '/admin/settings/catalog',
  '/admin/settings/catalog-access',
];
```

**عملیات**:
```sql
UPDATE catalog_items
SET is_active = false, updated_at = NOW()
WHERE key IN (...) OR route_admin LIKE (...)
```

**چرا is_active = false به جای DELETE؟**
- حفظ تاریخچه
- امکان بازگردانی
- جلوگیری از شکستن foreign keys

### 3. رفع Orphan Items

**مشکل**: ایتم‌هایی که `parent_key` آنها به ایتمی اشاره می‌کند که دیگر وجود ندارد.

**شناسایی**:
```sql
SELECT * FROM catalog_items
WHERE parent_key IS NOT NULL 
  AND parent_key NOT IN (SELECT key FROM catalog_items)
```

**راه‌حل**:
```sql
UPDATE catalog_items
SET parent_key = NULL
WHERE parent_key NOT IN (SELECT key FROM catalog_items)
```

### 4. تشخیص Circular Dependencies

**مشکل**: زنجیره‌های دایره‌ای والد-فرزند (A → B → C → A).

**شناسایی** (با استفاده از Recursive CTE):
```sql
WITH RECURSIVE tree AS (
  SELECT key, parent_key, ARRAY[key] AS path
  FROM catalog_items
  WHERE parent_key IS NOT NULL
  UNION ALL
  SELECT c.key, c.parent_key, tree.path || c.key
  FROM catalog_items c
  JOIN tree ON c.parent_key = tree.key
  WHERE NOT c.key = ANY(tree.path)
)
SELECT * FROM tree WHERE parent_key = ANY(path)
```

**رفع**: نیاز به دخالت دستی دارد (اسکریپت فقط گزارش می‌دهد).

**اگر circular dependency پیدا شود**: Transaction به‌صورت خودکار ROLLBACK می‌شود.

### 5. نرمالسازی order_index

**هدف**: ایجاد فواصل یکسان 10 تایی (10, 20, 30, ...).

**چرا فواصل 10 تایی؟**
- امکان افزودن ایتم جدید بین دو ایتم موجود (مثلاً بین 10 و 20، می‌توان 15 قرار داد)
- استاندارد رایج در سیستم‌های ordering

**عملیات**:
```sql
WITH ranked AS (
  SELECT 
    key,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(parent_key, 'root') 
      ORDER BY order_index, key
    ) * 10 as new_order
  FROM catalog_items
)
UPDATE catalog_items 
SET order_index = ranked.new_order
FROM ranked 
WHERE catalog_items.key = ranked.key
```

### 6. تنظیم آیکون پیشفرض

**قواعد**:
```javascript
type === 'page'    → 📄
type === 'group'   → 📁
type === 'setting' → ⚙️
type === 'report'  → 📊
type === 'tool'    → 🔧
default            → 📄
```

**عملیات**:
```sql
UPDATE catalog_items 
SET icon = CASE type
  WHEN 'page' THEN '📄'
  WHEN 'group' THEN '📁'
  WHEN 'setting' THEN '⚙️'
  WHEN 'report' THEN '📊'
  WHEN 'tool' THEN '🔧'
  ELSE '📄'
END
WHERE icon IS NULL OR icon = ''
```

## خروجی نمونه

### Dry-Run Mode
```
═══════════════════════════════════════════════════════════
UNIFIED CATALOG DATA CLEANUP
═══════════════════════════════════════════════════════════
Repository: smkhadivpoor/Toinfinity
Mode: 🔍 DRY RUN (preview only, no changes)
═══════════════════════════════════════════════════════════

📊 BEFORE CLEANUP
──────────────────────────────────────────────────────────
   Total items       : 245
   Active items      : 220
   Inactive items    : 25
   Types             : 6
   Duplicate keys    : 0
   Orphaned items    : 3
──────────────────────────────────────────────────────────

⚙️  OPERATIONS
──────────────────────────────────────────────────────────

🔍 Checking for duplicate keys...
   ✅ No duplicate keys found

🗑️  Deactivating deprecated items...
   Found 2 deprecated item(s):
   - admin.settings.catalog: "تنظیمات کاتالوگ"
   - admin.settings.catalog-access: "دسترسی کاتالوگ"
   [DRY RUN] Would set is_active = FALSE for these items

🔗 Fixing orphaned items...
   Found 3 orphaned item(s):
   - reports.custom.dashboard (parent: reports.custom)
   - tools.import.legacy (parent: tools.import)
   - admin.old.feature (parent: admin.old)
   [DRY RUN] Would set parent_key = NULL for these items

🔄 Checking for circular dependencies...
   ✅ No circular dependencies found

📏 Normalizing order_index...
   [DRY RUN] Would normalize order_index to 10, 20, 30, ...

🎨 Setting default icons...
   Found 15 item(s) without icons
   [DRY RUN] Would set default icons based on type:
     page    → 📄
     group   → 📁
     setting → ⚙️
     report  → 📊
     tool    → 🔧
     default → 📄
──────────────────────────────────────────────────────────

📋 SUMMARY
──────────────────────────────────────────────────────────
   Removed duplicates       : 0
   Deactivated deprecated   : 2
   Fixed orphans            : 3
   Circular deps found      : 0
   Normalized order_index   : 220
   Set default icons        : 15
──────────────────────────────────────────────────────────

[DRY RUN] No changes were made to the database

═══════════════════════════════════════════════════════════
✅ Cleanup completed successfully!
═══════════════════════════════════════════════════════════
```

### Live Run
```
═══════════════════════════════════════════════════════════
UNIFIED CATALOG DATA CLEANUP
═══════════════════════════════════════════════════════════
Repository: smkhadivpoor/Toinfinity
Mode: ⚙️  LIVE RUN (will make changes)
═══════════════════════════════════════════════════════════

📊 BEFORE CLEANUP
──────────────────────────────────────────────────────────
   Total items       : 245
   Active items      : 220
   Inactive items    : 25
   Types             : 6
   Duplicate keys    : 0
   Orphaned items    : 3
──────────────────────────────────────────────────────────

⚠️  WARNING: This will modify the catalog_items table!
Do you want to continue? (yes/no): yes

💾 Creating backup...
   ✅ Backed up 245 items to temp table: catalog_items_backup_2025-01-01T12-00-00

⚙️  OPERATIONS
──────────────────────────────────────────────────────────

🔍 Checking for duplicate keys...
   ✅ No duplicate keys found

🗑️  Deactivating deprecated items...
   Found 2 deprecated item(s):
   - admin.settings.catalog: "تنظیمات کاتالوگ"
   - admin.settings.catalog-access: "دسترسی کاتالوگ"
   ✅ Deactivated 2 item(s)

🔗 Fixing orphaned items...
   Found 3 orphaned item(s):
   - reports.custom.dashboard (parent: reports.custom)
   - tools.import.legacy (parent: tools.import)
   - admin.old.feature (parent: admin.old)
   ✅ Fixed 3 orphaned item(s)

🔄 Checking for circular dependencies...
   ✅ No circular dependencies found

📏 Normalizing order_index...
   ✅ Normalized 220 item(s)

🎨 Setting default icons...
   Found 15 item(s) without icons
   ✅ Set icons for 15 item(s)
──────────────────────────────────────────────────────────

📋 SUMMARY
──────────────────────────────────────────────────────────
   Removed duplicates       : 0
   Deactivated deprecated   : 2
   Fixed orphans            : 3
   Circular deps found      : 0
   Normalized order_index   : 220
   Set default icons        : 15
──────────────────────────────────────────────────────────

📊 AFTER CLEANUP
──────────────────────────────────────────────────────────
   Total items       : 245
   Active items      : 218
   Inactive items    : 27
   Types             : 6
   Duplicate keys    : 0
   Orphaned items    : 0
──────────────────────────────────────────────────────────

💾 Backup table: catalog_items_backup_2025-01-01T12-00-00 (temporary, will be lost on disconnect)

═══════════════════════════════════════════════════════════
✅ Cleanup completed successfully!
═══════════════════════════════════════════════════════════
```

## بازگردانی (Rollback)

### اسکریپت Rollback

برای بازگردانی تغییرات، از اسکریپت `rollback_catalog_unify.js` استفاده کنید:

#### 1. لیست Backup ها
```bash
node scripts/rollback_catalog_unify.js --list
```

خروجی:
```
═══════════════════════════════════════════════════════════
AVAILABLE BACKUP TABLES
═══════════════════════════════════════════════════════════

Found 2 backup table(s):

  📦 catalog_items_backup_2025-01-01T12-30-00
     Timestamp: 2025-01-01T12-30-00
     Records: 245
     Size: 128 kB

  📦 catalog_items_backup_2025-01-01T12-00-00
     Timestamp: 2025-01-01T12-00-00
     Records: 245
     Size: 128 kB

To restore from a backup, run:
  node scripts/rollback_catalog_unify.js --timestamp=TIMESTAMP
```

#### 2. بازگردانی از Backup
```bash
node scripts/rollback_catalog_unify.js --timestamp=2025-01-01T12-00-00
```

**نکته مهم**: اسکریپت قبل از بازگردانی، یک backup دیگر از وضعیت فعلی می‌گیرد.

### بازگردانی دستی

اگر backup table وجود نداشته باشد، باید از backup کامل دیتابیس بازگردانی کنید:

```bash
# بازگردانی از backup
psql $DATABASE_URL < backup_file.sql

# یا فقط جدول catalog_items
pg_restore -t catalog_items backup_file.dump
```

## عیب‌یابی (Troubleshooting)

### خطا: Database connection failed

**علل احتمالی**:
- متغیر `DATABASE_URL` تنظیم نشده
- PostgreSQL در حال اجرا نیست
- اطلاعات اتصال اشتباه است

**راه‌حل**:
```bash
# بررسی DATABASE_URL
echo $DATABASE_URL

# تست اتصال دستی
psql $DATABASE_URL -c "SELECT 1"
```

### خطا: Permission denied

**علل احتمالی**:
- کاربر دیتابیس دسترسی لازم ندارد

**راه‌حل**:
```sql
-- دادن دسترسی های لازم
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_items TO your_user;
GRANT CREATE ON SCHEMA public TO your_user;
```

### خطا: Circular dependencies detected

**معنی**: حلقه وابستگی در ساختار والد-فرزند وجود دارد.

**مثال**:
```
admin.settings → admin.settings.catalog → admin.settings → ...
```

**راه‌حل دستی**:
```sql
-- پیدا کردن مشکل
SELECT key, parent_key FROM catalog_items 
WHERE key IN ('admin.settings', 'admin.settings.catalog');

-- رفع (مثال)
UPDATE catalog_items 
SET parent_key = NULL 
WHERE key = 'admin.settings.catalog';
```

سپس دوباره اسکریپت را اجرا کنید.

### Warning: Backup is temporary

**معنی**: Backup در TEMP TABLE ذخیره می‌شود و پس از قطع اتصال از بین می‌رود.

**راه‌حل**: برای backup دائمی:
```sql
CREATE TABLE catalog_items_backup_permanent AS 
SELECT * FROM catalog_items;
```

## پرسش‌های متداول (FAQ)

### Q: آیا می‌توانم اسکریپت را روی production اجرا کنم؟

**A**: بله، اما:
1. ابتدا روی staging تست کنید
2. backup کامل از دیتابیس بگیرید
3. در ساعات کم‌کاری اجرا کنید
4. ابتدا با `--dry-run` اجرا کنید

### Q: چقدر طول می‌کشد؟

**A**: بستگی به تعداد رکوردها دارد:
- کمتر از 1000 رکورد: چند ثانیه
- 1000-10000 رکورد: کمتر از 1 دقیقه
- بیشتر از 10000 رکورد: چند دقیقه

### Q: آیا می‌تواند سیستم را خراب کند؟

**A**: خیر، به دلایل زیر:
- تمام عملیات در transaction هستند
- در صورت خطا، خودکار ROLLBACK می‌شود
- فقط جدول catalog_items را تغییر می‌دهد
- هیچ دیتایی DELETE نمی‌شود (فقط is_active = false)

### Q: چگونه بفهمم اسکریپت موفق بوده؟

**A**: خروجی را بررسی کنید:
```
✅ Cleanup completed successfully!
```

همچنین می‌توانید دستی بررسی کنید:
```sql
SELECT COUNT(*), is_active FROM catalog_items GROUP BY is_active;
SELECT COUNT(*) FROM catalog_items WHERE parent_key NOT IN (SELECT key FROM catalog_items);
```

### Q: آیا می‌توانم flags را ترکیب کنم؟

**A**: بله:
```bash
# مثال
node scripts/unify_catalog_data.js --dry-run --keep-old
node scripts/unify_catalog_data.js --force --keep-old
```

### Q: backup چقدر نگه داشته می‌شود؟

**A**: backup های TEMP TABLE تا زمان قطع اتصال دیتابیس نگه داشته می‌شوند.

برای backup دائمی، از query دستی استفاده کنید:
```sql
CREATE TABLE catalog_items_backup AS SELECT * FROM catalog_items;
```

## بهترین شیوه‌ها (Best Practices)

### قبل از اجرا
1. ✅ **Backup کامل** از دیتابیس بگیرید
2. ✅ در **محیط test** ابتدا اجرا کنید
3. ✅ با `--dry-run` پیش‌نمایش کنید
4. ✅ **تیم** را از اجرا مطلع کنید
5. ✅ در **ساعات کم‌کاری** اجرا کنید

### حین اجرا
1. ✅ خروجی را **ذخیره** کنید (log)
2. ✅ اتصال اینترنت را **قطع نکنید**
3. ✅ اسکریپت را **متوقف نکنید** (Ctrl+C)

### بعد از اجرا
1. ✅ **تست دستی** سیستم را انجام دهید
2. ✅ **گزارش** را بررسی کنید
3. ✅ اگر مشکلی بود، **rollback** کنید
4. ✅ پس از تأیید، backup های قدیمی را **پاک** کنید

## یادآوری نهایی

این اسکریپت یک ابزار قدرتمند برای پاکسازی و واحدسازی کاتالوگ است. با رعایت نکات ایمنی و بهترین شیوه‌ها، می‌توانید با اطمینان از آن استفاده کنید.

**در صورت هرگونه سؤال یا مشکل، به تیم توسعه مراجعه کنید.**

---

**نسخه**: 1.0.0  
**تاریخ**: 2025-01-01  
**نویسنده**: Toinfinity Development Team
