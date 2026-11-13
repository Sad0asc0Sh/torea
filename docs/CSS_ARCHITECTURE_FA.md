# راهنمای معماری CSS (فارسی)

این سند معماری کامل سیستم CSS جدید را توضیح می‌دهد؛ سیستمی چهارلایه، ماژولار، RTL-first و theme-aware که پس از refactorهای PR #181، #182 و #184 مستقر شد.

## 1) فلسفه و اصول طراحی
- **Modular & Layered:** هر لایه تنها مسئول یک سطح از انتزاع است.
- **Token-driven:** همه رنگ‌ها، فاصله‌ها و تایپوگرافی از `variables.css` خوانده می‌شود.
- **RTL-first:** مقادیر پایه و direction برای زبان فارسی بهینه شده است.
- **Theme-aware:** تم‌ها از طریق `data-theme` روی تگ `<html>` فعال می‌شوند.
- **Utility + Component:** ترکیب کلاس‌های utility برای چیدمان و کلاس‌های component برای انسجام طراحی.

## 2) معماری ۴ لایه

| لایه | مسیر | نقش |
| ---- | ---- | ---- |
| Foundation | `src/public/css/1-foundation/` | متغیرها، reset، تایپوگرافی، پایه RTL |
| Components | `src/public/css/2-components/` | دکمه‌ها، فرم‌ها، کارت‌ها، جداول، Badges، ناوبری |
| Layouts | `src/public/css/3-layouts/` | Grid، فاصله‌بندی، shell صفحه و containerها |
| Views | `src/public/css/4-views/` | Theme و overrideهای مخصوص admin و user |
| Entry | `src/public/css/app.css` | نقطه ورود که همه لایه‌ها را import می‌کند |

## 3) نامگذاری و قراردادها
- نام فایل‌ها `kebab-case` و پوشه‌های لایه‌ای با پیشوند عددی هستند.
- کلاس‌های کامپوننت‌ها از الگوی BEM ساده پیروی می‌کنند: `component__part`, `component--modifier`.
- Utilities کوتاه و یکنواخت‌اند: فاصله‌ها (`mt-2`, `px-3`)، Grid (`grid-cols-3`, `grid-gap-md`).
- حالت‌ها با `is-*` مشخص می‌شوند: `is-disabled`, `is-active`.
- Theme از طریق attribute انجام می‌شود: `[data-theme="admin"] { ... }`.

## 4) راهنمای کامپوننت‌ها

### Buttons (`buttons.css`)
- کلاس پایه: `btn`
- تنوع‌ها: `btn--primary`, `btn--secondary`, `btn--ghost`, `btn--danger`, `btn--outline`
- حالات: `is-disabled`, `is-loading` (نمایش spinner مبتنی بر pseudo-element)

### Forms (`forms.css`)
- ورودی پایه: `input`, `select`, `textarea` با focus ring مشخص
- گروه‌ها: `form-control`, برچسب: `form-control__label`
- پیام‌ها: `form-hint`, و حالت خطا با `form-hint--error`
- چینش افقی/عمودی: `form--inline` برای فرم‌های چندستونه

### Cards (`cards.css`)
- wrapper: `card`
- بخش‌ها: `card__title`, `card__meta`, `card__footer`
- حالت‌ها: `card--interactive` (هاور)، `card--success`, `card--warning`

### Tables (`tables.css`)
- کلاس پایه: `table`
- حالت‌ها: `table--bordered`, `table--striped`, `table--compact`
- Utility سطر: `table__row--active`, `table__cell--numeric` برای ترازبندی اعداد
- قابلیت اسکرول افقی با wrapper: `table-container`

### Badges (`badges.css`)
- کلاس پایه: `badge`
- رنگ‌ها: `badge--info`, `badge--success`, `badge--warning`, `badge--danger`, `badge--neutral`
- اندازه: `badge--sm`, `badge--lg`

### Navigation (`navigation.css`)
- wrapper: `nav`, آیتم: `nav__item`
- انواع: `nav--top` (هدر)، `nav--drawer` (منوی کناری)
- حالت فعال: `nav__item--active`
- پشتیبانی از breadcrumb: `nav--breadcrumb` با جداکننده `nav__separator`

## 5) Grid و سیستم فاصله

- **Grid:** `grid`, به همراه `grid-cols-2`, `grid-cols-3`, `grid-cols-4`; فواصل با `grid-gap-sm/md/lg`.
- **Flex utilities:** `flex`, `items-center`, `justify-between`, `wrap`, `inline-flex`.
- **Spacing scale:** `--space-1` تا `--space-6` در `variables.css` تعریف شده؛ کلاس‌های `mt-*`, `mb-*`, `pt-*`, `px-*` از این مقادیر استفاده می‌کنند.
- **Container & Shell:** `layout-shell` برای ساختار صفحه، `container` برای محدود کردن عرض و ایجاد حاشیه خودکار.

## 6) شخصی‌سازی Theme

1. روی `<html>` مقدار `data-theme` را تغییر دهید (`admin` یا `user`).
2. در `1-foundation/variables.css` مقادیر رنگ/spacing/typography را برای theme جدید override کنید.
3. برای themeهای خاص صفحه، در `4-views/` فایل جدید بسازید و فقط تغییرات لازم را اضافه کنید.
4. از CSS Custom Properties برای سازگاری dark/light استفاده کنید؛ مثال:

```css
[data-theme="admin"] {
  --color-bg: #020617;
  --color-surface: #0b1224;
  --color-primary: #6366f1;
  --color-text: #e5e7eb;
}
```

## 7) Best Practices
- همیشه `app.css` را لود کنید؛ از وارد کردن مستقیم فایل‌های درونی خودداری کنید.
- کلاس‌های utility را با کامپوننت‌ها ترکیب کنید، اما از زنجیره‌های طولانی جلوگیری کنید.
- برای RTL متن‌ها از کلاس‌های تایپوگرافی آماده استفاده کنید و جهت را به مرورگر بسپارید.
- تغییر رنگ‌ها را فقط از طریق متغیرهای لایه Foundation انجام دهید.
- از inline-style پرهیز کنید؛ به‌جای آن کلاس‌های spacing یا متغیرهای theme را مصرف کنید.
- برای قابلیت دسترس‌پذیری از کنتراست رنگی متناسب و وضعیت focus مشخص استفاده کنید.

## 8) Troubleshooting
- **Theme عوض نمی‌شود:** مقدار `data-theme` روی تگ `<html>` بررسی شود؛ کش مرورگر را پاک کنید.
- **فونت بارگذاری نمی‌شود:** مسیر `/fonts/vazir/` و لینک در `typography.css` را چک کنید.
- **جداول از عرض خارج می‌شوند:** حتماً جداول را در `.table-container` قرار دهید یا `overflow-x:auto` فعال کنید.
- **Spacing ناسازگار است:** وجود تداخل کلاس‌های margin/padding قدیمی را بررسی و با utilities جدید جایگزین کنید.
- **تعارض استایل قدیمی:** در صورت وجود کلاس‌های legacy مثل `.btn-primary`، به جدول مهاجرت در `CSS_MIGRATION_GUIDE_FA.md` مراجعه کنید.

## 9) مسیرهای مرتبط
- راهنمای سریع: `src/public/css/QUICK_START_FA.md`
- راهنمای مهاجرت: `docs/CSS_MIGRATION_GUIDE_FA.md`
- مقایسه قبل/بعد: `docs/CSS_BEFORE_AFTER_COMPARISON_FA.md`
- چک‌لیست توسعه‌دهنده: `docs/CSS_DEVELOPER_CHECKLIST.md`
