# 📚 راهنمای مدیریت Reports در Catalog Manager

## تغییرات سیستم

### قبل (v2.x):
- Reports به صورت خودکار از کد sync میشدند
- دکمه Sync در `/admin/reports`
- Navigation items به صورت اتوماتیک از `reportCatalog.js` ایجاد میشدند

### بعد (v3.0+):
- **Report definitions** (widgets, queries, configs) همچنان از کد sync میشوند
- **Navigation items** فقط از UI مدیریت میشوند
- مسیر مدیریت: `/admin/settings/catalog-manager`

---

## نحوه اضافه کردن Report به Navigation

### 1. اطمینان از وجود Parent Group

ابتدا باید Parent Group وجود داشته باشد:

```
admin.reports (type: group)
  ├─ key: admin.reports
  ├─ title: گزارشات
  ├─ parent_key: admin
  └─ route: /admin/reports
```

### 2. اضافه کردن Report Item

برای هر گزارش:

```
admin.reports.my_today_summary (type: report)
  ├─ key: admin.reports.my_today_summary
  ├─ title: خلاصه امروز من
  ├─ parent_key: admin.reports
  └─ route: /admin/reports/my_today_summary
```

### 3. مراحل در UI

1. برو به `/admin/settings/catalog-manager`
2. در بخش "Add New Item" گزینه "Report" را انتخاب کن
3. فیلدها را پر کن:
   - **Key**: `admin.reports.my_today_summary`
   - **Title**: `خلاصه امروز من`
   - **Parent Key**: `admin.reports`
   - **Route (Admin)**: `/admin/reports/my_today_summary`
   - **Order Index**: عدد دلخواه (مثلاً 10)
4. روی "Add Item" کلیک کن
5. Apply Changes

---

## تفاوت دو جدول

### `catalog_items` (Navigation & Access Control)
- **مدیریت**: از UI (`/admin/settings/catalog-manager`)
- **محتوا**: key, title, route, parent_key, order_index
- **نقش**: Navigation menu و Access Control
- **مثال**: آیا این گزارش در منو نمایش داده شود؟

### `report_catalog` (Business Logic)
- **مدیریت**: از Code (`src/reports/reportCatalog.js`)
- **محتوا**: widgets, queries, chart configs, data sources
- **نقش**: Report Definition و Business Logic
- **مثال**: این گزارش چه ویجت‌هایی دارد و چه query هایی اجرا می‌کند؟

**خلاصه**: جداسازی Concerns - Navigation (ساده) از Business Logic (پیچیده)

---

## Migration از v2.x به v3.0

### SQL برای اضافه کردن همه Reports به Navigation

اگر از نسخه قدیم آپگرید می‌کنید و می‌خواهید تمام گزارشات را به navigation اضافه کنید:

```sql
-- مرحله 1: اطمینان از وجود Parent Group
INSERT INTO catalog_items (key, type, title, route_admin, parent_key, order_index, is_active)
VALUES ('admin.reports', 'group', 'گزارشات', '/admin/reports', 'admin', 40, TRUE)
ON CONFLICT (key) DO UPDATE SET is_active = TRUE;

-- مرحله 2: اضافه کردن تمام Reports فعال
INSERT INTO catalog_items (key, type, title, route_admin, parent_key, order_index, is_active)
SELECT 
  'admin.reports.' || rc.key,
  'report',
  rc.title,
  '/admin/reports/' || rc.key,
  'admin.reports',
  rc.order_index,
  TRUE
FROM report_catalog rc
WHERE rc.is_active = TRUE
ON CONFLICT (key) DO UPDATE SET 
  title = EXCLUDED.title,
  route_admin = EXCLUDED.route_admin,
  order_index = EXCLUDED.order_index,
  is_active = TRUE;
```

### پس از اجرای SQL

1. برو به `/admin/settings/catalog-manager`
2. تمام items را مشاهده کن
3. ترتیب یا تنظیمات را در صورت نیاز تغییر بده
4. Apply Changes

---

## چگونه Report جدید اضافه کنم؟

### مرحله 1: تعریف Business Logic (Code)

در فایل `src/reports/reportCatalog.js`:

```javascript
{
  key: 'my_new_report',
  title: 'گزارش جدید من',
  scope: 'user',
  order_index: 50,
  sources: ['کاربر'],
  widgets: [
    {
      type: 'summary',
      title: 'خلاصه',
      query_name: 'my_query',
      // ...
    }
  ]
}
```

### مرحله 2: ایجاد Query (Code)

در فایل `src/reports/queries/`:

```javascript
// src/reports/queries/myQuery.js
async function myQuery(userId, orgNodeId, pool) {
  // Query implementation
  return result;
}

module.exports = { myQuery };
```

### مرحله 3: اضافه به Navigation (UI)

1. Server را restart کن تا report definition sync شود
2. برو به `/admin/settings/catalog-manager`
3. Report item جدید را اضافه کن (مراحل قسمت "نحوه اضافه کردن Report به Navigation")

---

## FAQ

### Q: چطوری report جدید اضافه کنم؟
**A**: 
1. تعریف business logic در `src/reports/reportCatalog.js` (widgets, queries)
2. اضافه کردن navigation item از `/admin/settings/catalog-manager`

### Q: چرا دو جدول جدا داریم؟
**A**: جداسازی concerns - navigation (ساده، از UI) از business logic (پیچیده، از code)

### Q: آیا reports قدیمی کار میکنند؟
**A**: بله، فقط باید navigation items را از UI فعال کنید. Business logic همچنان کار می‌کند.

### Q: چرا auto-sync حذف شد؟
**A**: 
- Foreign Key errors (parent_key = 'admin.reports' همیشه وجود نداشت)
- دوگانگی در مدیریت
- Catalog Manager یک سیستم یکپارچه برای همه navigation items است

### Q: اگر report را از navigation حذف کنم چه می‌شود؟
**A**: Report از منو حذف می‌شود ولی business logic (widgets, queries) همچنان در دیتابیس وجود دارد. اگر دوباره navigation item را فعال کنید، report کار می‌کند.

### Q: چگونه ترتیب reports را تغییر دهم؟
**A**: از `/admin/settings/catalog-manager`، order_index هر item را ویرایش کنید.

### Q: آیا می‌توانم report را فقط برای برخی نقش‌ها فعال کنم؟
**A**: بله، از طریق Catalog Manager می‌توانید access control را مدیریت کنید.

---

## توجه: تغییرات Breaking

### ⚠️ Breaking Changes در v3.0

1. **دکمه Sync حذف شد**: دیگر `/admin/reports/sync` وجود ندارد
2. **Auto-sync navigation حذف شد**: باید manual از UI اضافه کنید
3. **Function حذف شد**: `syncReportNavigationItems()` در `catalog.service.js`

### ✅ Non-Breaking (همچنان کار می‌کند)

1. **Report definitions sync**: `syncReportsToDatabase()` همچنان کار می‌کند
2. **Widgets & Queries**: همه business logic دست نخورده
3. **Existing reports**: گزارشاتی که قبلاً navigation داشتند همچنان کار می‌کنند
4. **Report rendering**: نمایش reports بدون تغییر

---

## Log Messages جدید

هنگام startup، log messages زیر را خواهید دید:

```
[Reports] Syncing report definitions... (attempt 1/3)
[Reports] ✅ Report definitions synced (widgets, queries, configs)
[Reports] ℹ️  Navigation items must be managed via /admin/settings/catalog-manager
```

این نشان می‌دهد که:
- ✅ Business logic sync شده
- ℹ️ باید navigation را manual مدیریت کنید

---

## مراجع

- **Catalog Manager Guide**: `docs/CATALOG_MANAGER_USER_GUIDE.md`
- **Catalog Migration Guide**: `docs/CATALOG_MIGRATION_GUIDE.md`
- **Reports Code**: `src/reports/reportCatalog.js`
- **Reports Service**: `src/services/reports.service.js`

---

## Support

اگر مشکلی دارید:
1. Log های server را بررسی کنید
2. به `/admin/settings/catalog-manager/health` مراجعه کنید
3. دستور `npm run catalog:health` را اجرا کنید

---

**آخرین بروزرسانی**: دسامبر 2025
**نسخه**: 3.0
