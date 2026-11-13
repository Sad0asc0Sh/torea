# گزارش ممیزی رابط کاربری پنل ادمین

**تاریخ**: 2025-12-25  
**هدف**: شناسایی مشکلات و نیازهای بازسازی در صفحات پنل ادمین

---

## 1. ممیزی فایلهای EJS

### خلاصه آماری
- **تعداد کل فایلها**: 46 فایل
- **فایلهای نیازمند refactor**: 46 فایل (100%)
- **فایلها با inline HTML کامل**: 46 فایل
- **فایلها با menu structure تکراری**: 38 فایل
- **فایلها با inline styles**: 37 فایل

### جدول تفصیلی

| مسیر فایل | استفاده از Layout مشترک | Menu Structure تکراری | Inline Styles | نیاز به Refactor | اولویت |
|-----------|------------------------|----------------------|---------------|------------------|---------|
| `src/views/admin/dashboard.ejs` | ❌ | ❌ | ✅ | بله | 🔴 بالا |
| `src/views/admin/definitions/products.ejs` | ❌ | ❌ | ❌ | بله | 🔴 بالا |
| `src/views/admin/balance/debts_import.ejs` | ❌ | ❌ | ❌ | بله | 🔴 بالا |
| `src/views/admin/balance/debts_import_map.ejs` | ❌ | ❌ | ❌ | بله | 🔴 بالا |
| `src/views/admin/users.ejs` | ❌ | ❌ | ❌ | بله | 🟡 متوسط |
| `src/views/admin/reports.ejs` | ❌ | ❌ | ❌ | بله | 🟡 متوسط |
| `src/views/admin/hierarchy.ejs` | ❌ | ❌ | ❌ | بله | 🟡 متوسط |
| `src/views/admin/definitions/teams.ejs` | ❌ | ❌ | ❌ | بله | 🟡 متوسط |
| `src/views/admin/definitions/brands.ejs` | ❌ | ❌ | ❌ | بله | 🟡 متوسط |
| `src/views/admin/approvals.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/hierarchy_arrange.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/user_edit.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/balance/credit_request_form.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/balance/credit_requests_list.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/balance/debts_list.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/balance/index.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/balance/settlement_request_form.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/balance/settlement_requests_list.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/automation_topic_form.ejs` | ❌ | ❌ | ✅ | بله | 🟢 پایین |
| `src/views/admin/definitions/automation_topics.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/brand_form.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/credit_policy.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/credit_policy_form.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/customer_industries.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/customer_industry_form.ejs` | ❌ | ❌ | ✅ | بله | 🟢 پایین |
| `src/views/admin/definitions/index.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/product_form.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/team_brands.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/team_form.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/team_members.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/user_edit.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/definitions/users.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/settings/apis.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/settings/catalog.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/settings/catalog_access.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/settings/index.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/settings/training_config.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/settings/training_topics.ejs` | ❌ | ❌ | ❌ | بله | 🟢 پایین |
| `src/views/admin/tools/index.ejs` | ❌ | ✅ | ❌ | بله | 🟢 پایین |
| `src/views/admin/tools/negotiation_analysis.ejs` | ❌ | ✅ | ❌ | بله | 🟢 پایین |
| `src/views/admin/tools/negotiation_practice.ejs` | ❌ | ✅ | ✅ | بله | 🟢 پایین |
| `src/views/admin/tools/training.ejs` | ❌ | ✅ | ❌ | بله | 🟢 پایین |
| `src/views/admin/tools/automation/announcement.ejs` | ❌ | ✅ | ✅ | بله | 🟢 پایین |
| `src/views/admin/tools/automation/index.ejs` | ❌ | ✅ | ❌ | بله | 🟢 پایین |
| `src/views/admin/tools/automation/referral.ejs` | ❌ | ✅ | ✅ | بله | 🟢 پایین |
| `src/views/admin/tools/automation/request.ejs` | ❌ | ✅ | ✅ | بله | 🟢 پایین |

---

## 2. ممیزی فایلهای CSS

### ساختار فعلی

```
src/public/css/
├── 1-foundation/          ✅ ساختار مدرن
├── 2-components/          ✅ ساختار مدرن
├── 3-layouts/             ✅ ساختار مدرن
├── 4-views/               ✅ ساختار مدرن
├── shared/                ✅ مشترک
├── app.css                ✅ Entry point اصلی
├── app-old-backup.css     ❌ فایل قدیمی (17KB) - باید به deprecated منتقل شود
├── demo-admin.html        ℹ️  فایل دمو
├── demo-user.html         ℹ️  فایل دمو
└── test-css-conflict-resolution.html  ℹ️  فایل تست
```

### دستهبندی CSS

#### ✅ CSSهای در ساختار جدید
- `1-foundation/` - رنگها، تایپوگرافی، متغیرها
- `2-components/` - دکمهها، کارتها، فرمها
- `3-layouts/` - app-bar, drawer, grids
- `4-views/` - صفحات خاص
- `shared/` - استایلهای مشترک
- `app.css` - entry point اصلی

#### ❌ CSSهای قدیمی که باید به `deprecated/` منتقل شوند
- `app-old-backup.css` (17,272 bytes) - backup قدیمی

#### ℹ️ فایلهای دمو و تست (نگهداری میشوند)
- `demo-admin.html`
- `demo-user.html`
- `test-css-conflict-resolution.html`

### توصیهها
1. ایجاد پوشه `src/public/css/deprecated/`
2. انتقال `app-old-backup.css` به `deprecated/`
3. حذف inline styles از فایلهای EJS
4. اطمینان از استفاده همه صفحات از `app.css`

---

## 3. ممیزی سیستم Import/Template

### 3.1 محصولات (Products)

#### مسیر فایلها
- **Route**: `src/routes/admin/definitions/products.routes.js`
- **View**: `src/views/admin/definitions/products.ejs`

#### وضعیت فعلی
✅ **هدرهای فارسی در template موجود است**

**Route تولید template**: `GET /admin/definitions/products/template.xlsx` (خط 247)
```javascript
const TEMPLATE_HEADERS_FA = HEADER_DEFS.map((h) => h.fa);
// ['کد برند', 'نام برند', 'نام کالا', 'کد کالا', ...]
```

**Sample rows** (خطوط 34-37):
```javascript
['BR-100', 'نوشیدنی آفتاب', 'نوشابه پرتقالی خانواده', 'SKU-OR-100', 'نوشابه, پرتقالی', 'بله', 'بله']
```

✅ **Parser از هدرهای فارسی و انگلیسی پشتیبانی میکند**

**Header mapping** (خطوط 12-20):
```javascript
const HEADER_DEFS = [
  { key: 'brand_code', fa: 'کد برند', aliases: ['کد برند کالا', 'brand code'] },
  { key: 'brand_name', fa: 'نام برند', aliases: ['نام برند کالا', 'brand name'] },
  // ...
];
```

**Boolean parsing** (خطوط 106-117):
```javascript
const TRUE_SET = new Set(['1','true','t','yes','y','on','بله','بلی','فعال']);
const FALSE_SET = new Set(['0','false','f','no','n','off','خیر','غیرفعال']);
```

#### توصیهها
- ✅ قالب فارسی موجود است
- ✅ Parser backward compatible است
- ℹ️ UI راهنما در صفحه products.ejs باید بهروز شود (خط 246-249)

---

### 3.2 بدهیها (Debts)

#### مسیر فایلها
- **Route**: `src/routes/admin/balance/index.js`
- **View**: `src/views/admin/balance/debts_import.ejs`
- **View Map**: `src/views/admin/balance/debts_import_map.ejs`

#### وضعیت فعلی
✅ **هدرهای فارسی در template موجود است**

**Route تولید template**: `GET /admin/balance/debts/template.xlsx` (خط 709)
```javascript
const headers = ['کد مشتری', 'مبلغ بدهی', 'تاریخ سررسید', 'شماره فاکتور', 'نام مشتری', 'کد مالی فروشنده'];
```

**Sample rows** (خطوط 715-716):
```javascript
['۱۲۳۴۵', '۱,۵۰۰,۰۰۰', '2025-01-15', 'فاکتور-۱۰۱', 'شرکت سپهر', 'AC-501'],
['۹۸۷۶۵', '۲,۳۰۰,۰۰۰', '2025-02-01', 'فاکتور-۱۰۲', 'فروشگاه آتیه', 'AC-502']
```

⚠️ **نام کاربری (username) هنوز در mapping وجود دارد**

**Default mapping** (خطوط 130-149):
```javascript
seller_accounting_code: pick('seller_accounting_code', 'accounting_code', 'کد مالی فروشنده', ...),
seller_username: pick('seller_username', 'username', 'نام کاربری فروشنده'),  // ⚠️ هنوز موجود است
```

**Parser logic** (خطوط 851-867):
```javascript
const sellerUsername = safeText(getVal(mapping.seller_username)) || null;
const sellerAccountingCode = safeText(getVal(mapping.seller_accounting_code)) || null;

if (!resolvedSellerId) {
  if (sellerAccountingCode) {
    // ✅ اول accounting code را چک میکند
  } else if (sellerUsername) {
    // ⚠️ سپس username را چک میکند (backward compatibility)
  } else {
    errs.push(`کد مالی فروشنده در ردیف ${excelRow} وارد نشده است.`);
  }
}
```

#### توصیهها
- ✅ قالب فارسی موجود است
- ✅ `کد مالی فروشنده` در template است
- ⚠️ `seller_username` در mapping هنوز وجود دارد (برای backward compatibility)
- ℹ️ UI راهنما در debts_import.ejs خط 200 درست است
- ℹ️ template فعلی از username استفاده نمیکند (صحیح است)

**نتیجه**: فایلهای template هر دو فارسی هستند و parser هم از فارسی/انگلیسی پشتیبانی میکند. برای debts، username از template حذف شده اما در parser برای backward compatibility نگه داشته شده (صحیح است).

---

## 4. مشکلات اصلی شناساییشده

### 4.1 تکرار کد شدید
- **مشکل**: تمام 46 فایل EJS کد HTML کامل دارند
- **تاثیر**: هر تغییری باید در 46 جا اعمال شود
- **راهحل**: استفاده از layout مشترک

### 4.2 Menu Structure تکراری
- **مشکل**: 38 فایل menu structure را دوباره تعریف میکنند
- **تاثیر**: اضافه کردن menu item جدید نیاز به تغییر 38 فایل دارد
- **راهحل**: مرکزیسازی menu در `admin_menu_config.ejs`

### 4.3 Inline Styles
- **مشکل**: 37 فایل inline styles دارند
- **تاثیر**: ناسازگاری در ظاهر، دشواری maintenance
- **راهحل**: استفاده از کلاسهای CSS از `app.css`

### 4.4 عدم استفاده از Layout مشترک
- **مشکل**: فایل `admin_layout.ejs` وجود دارد اما استفاده نمیشود
- **تاثیر**: عدم یکپارچگی در UI
- **راهحل**: Refactor تمام صفحات برای استفاده از layout

---

## 5. برنامه اقدام پیشنهادی

### فاز 1: ایجاد زیرساخت (Priority: HIGH)
- [ ] ایجاد `src/views/partials/admin_menu_config.ejs`
- [ ] بررسی و تست `src/views/partials/admin_layout.ejs`
- [ ] ایجاد `src/views/partials/admin_layout_footer.ejs`

### فاز 2: Refactor صفحات با اولویت بالا (Priority: HIGH)
- [ ] `dashboard.ejs`
- [ ] `definitions/products.ejs`
- [ ] `balance/debts_import.ejs`
- [ ] `balance/debts_import_map.ejs`

### فاز 3: Refactor صفحات با اولویت متوسط (Priority: MEDIUM)
- [ ] `users.ejs`
- [ ] `reports.ejs`
- [ ] `hierarchy.ejs`
- [ ] `definitions/teams.ejs`
- [ ] `definitions/brands.ejs`

### فاز 4: Refactor بقیه صفحات (Priority: LOW)
- [ ] 31 فایل باقیمانده

### فاز 5: Cleanup و Testing
- [ ] انتقال CSS قدیمی به `deprecated/`
- [ ] حذف inline styles
- [ ] تست در مرورگرهای مختلف
- [ ] تست responsive

---

## 6. نتیجهگیری

### آمار کلی
- ✅ Layout مشترک موجود است: `admin_layout.ejs`
- ❌ هیچ صفحهای از layout استفاده نمیکند
- ✅ CSS مدرن موجود است
- ❌ همهجا inline styles استفاده شده
- ✅ Template فایلها فارسی هستند
- ✅ Parser از فارسی/انگلیسی پشتیبانی میکند

### تخمین زمان
- **فاز 1**: 2 ساعت
- **فاز 2**: 4 ساعت
- **فاز 3**: 5 ساعت
- **فاز 4**: 10 ساعت
- **فاز 5**: 3 ساعت
- **جمع**: ~24 ساعت کاری

### توصیههای نهایی
1. شروع با فاز 1 (زیرساخت)
2. Refactor گام به گام با commit مجزا برای هر صفحه
3. تست manual بعد از هر گروه refactor
4. نگهداری backward compatibility در parser ها
5. مستندسازی دقیق تغییرات

---

**پایان گزارش ممیزی**
