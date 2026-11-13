# Views Layouts

این پوشه برای قرار دادن فایل‌های layout مشترک EJS طراحی شده است.

## هدف

جلوگیری از تکرار کد در view ها با استفاده از layout های مشترک.

## ساختار پیشنهادی

### `admin.ejs`
Layout مشترک برای صفحات پنل ادمین که شامل:
- Header و navigation مخصوص ادمین
- Sidebar منوی ادمین
- Footer مشترک

### `user.ejs`
Layout مشترک برای صفحات کاربر عادی که شامل:
- Header و navigation مخصوص کاربر
- منوی دسترسی سریع
- Footer مشترک

### `auth.ejs`
Layout ساده برای صفحات احراز هویت (login، register) که شامل:
- Header ساده
- فرم مرکزی
- Footer ساده بدون منو

## نحوه استفاده (پیاده‌سازی آینده)

به‌جای استفاده از partials برای header و footer در هر صفحه، می‌توان از layout استفاده کرد:

```ejs
<%- include('../layouts/admin', {
  title: 'داشبورد',
  activeMenu: 'dashboard',
  content: '...' 
}) %>
```

یا با استفاده از کتابخانه‌هایی مانند `express-ejs-layouts`.

## وضعیت فعلی

در حال حاضر، پروژه از partials استفاده می‌کند:
- `partials/admin_page_begin.ejs`
- `partials/admin_page_end.ejs`
- `partials/user_page_begin.ejs`
- `partials/user_page_end.ejs`

این ساختار می‌تواند در آینده به layout ها منتقل شود.

## مزایای استفاده از Layouts

1. **کاهش تکرار کد**: کد HTML مشترک فقط یک‌بار نوشته می‌شود
2. **نگهداری آسان‌تر**: تغییرات در یک فایل به همه صفحات اعمال می‌شود
3. **سازگاری بهتر**: ساختار یکپارچه در تمام صفحات
4. **توسعه سریع‌تر**: اضافه کردن صفحات جدید با کد کمتر

## توجه

پیاده‌سازی کامل layouts نیازمند:
- بررسی و استخراج کدهای مشترک از partials
- بازنویسی view های موجود برای استفاده از layout
- تست کامل UI پس از تغییرات

این کار می‌تواند در PR جداگانه انجام شود.
