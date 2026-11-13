# راهنمای سریع CSS (فارسی)

این راهنما خلاصه‌ای از سیستم CSS مدرن پروژه است که پس از refactorهای PR #181، PR #182 و PR #184 معرفی شد. ساختار جدید ۴ لایه است، از متغیرهای متمرکز استفاده می‌کند و به‌صورت پیش‌فرض RTL و theme-aware است.

## شروع سریع

1. اطمینان از سرو شدن فایل‌ها از `/css/`
2. فقط `app.css` را لود کنید (تمام لایه‌ها را import می‌کند)
3. روی تگ `<html>` مقدار `data-theme` را مشخص کنید (`admin` یا `user`)

```html
<!doctype html>
<html lang="fa" dir="rtl" data-theme="admin">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="/css/app.css" />
  </head>
  <body class="layout-shell spacing-md">
    <header class="nav nav--top">
      <div class="nav__brand">ToInfinity Admin</div>
      <button class="btn btn--ghost">خروج</button>
    </header>

    <main class="grid grid-cols-2 grid-gap-md">
      <section class="card">
        <h2 class="card__title">گزارش لحظه‌ای</h2>
        <p class="text-muted">آخرین وضعیت تیم‌ها و برندها</p>
        <button class="btn btn--primary">نمایش جزئیات</button>
      </section>
      <section class="card">
        <h2 class="card__title">وضعیت تسویه‌ها</h2>
        <p class="badge badge--info">۲۴ پرونده باز</p>
      </section>
    </main>
  </body>
</html>
```

## ساختار فایل‌ها

- `1-foundation/` — متغیرها، reset، تایپوگرافی و پایه‌های RTL
- `2-components/` — اجزای تکرارشونده (دکمه، فرم، کارت، جدول، نشان، ناوبری)
- `3-layouts/` — ابزارک‌های لایه‌بندی (grid، spacing، shell)
- `4-views/` — تم‌های نماها (`admin` و `user`)
- `app.css` — ورودی اصلی که همه لایه‌ها را import می‌کند

## کلاس‌های پرکاربرد

- **Buttons:** `btn`, `btn--primary`, `btn--secondary`, `btn--ghost`, `btn--danger`, حالت غیرفعال با `is-disabled`
- **Forms:** `form-control`, `input`, `select`, `checkbox`, پیام خطا با `form-hint form-hint--error`
- **Cards:** `card`, `card__title`, `card__meta`, `card__footer`
- **Tables:** `table`, `table--bordered`, `table--striped`, سطر تاکید شده با `table__row--active`
- **Badges:** `badge`, `badge--info`, `badge--success`, `badge--warning`, `badge--danger`
- **Navigation:** `nav`, `nav--top`, `nav--drawer`, آیتم فعال با `nav__item--active`
- **Grid & Spacing:** `grid`, `grid-cols-2`, `grid-cols-3`, `grid-gap-md`, و Utilities فاصله مثل `mt-2`, `mb-3`, `px-4`
- **Theme Switch:** روی `<html data-theme="admin">` یا `<html data-theme="user">` قرار می‌گیرد؛ رنگ‌ها از متغیرهای `:root` خوانده می‌شوند

## مثال‌های عملی

### فرم لاگین
```html
<form class="card spacing-md">
  <h1 class="card__title">ورود</h1>
  <label class="form-control">
    <span class="form-control__label">شماره موبایل</span>
    <input class="input" type="tel" placeholder="09xx..." required />
  </label>
  <label class="form-control">
    <span class="form-control__label">رمز عبور</span>
    <input class="input" type="password" required />
    <span class="form-hint form-hint--error">رمز عبور الزامی است</span>
  </label>
  <button class="btn btn--primary btn--block">ورود</button>
</form>
```

### کارت داده با Badge
```html
<div class="card spacing-sm">
  <div class="card__title">حجم فروش</div>
  <div class="card__meta">امروز</div>
  <div class="display-3">۱۲٬۴۵۰٬۰۰۰ تومان</div>
  <span class="badge badge--success">+۱۲٪ نسبت به دیروز</span>
</div>
```

## لینک‌های مفید

- صفحات دمو و تست قدیمی از `src/public/css` حذف شدند؛ در صورت نیاز از تاریخچه گیت قابل بازیابی‌اند.
- راهنمای کامل معماری: `docs/CSS_ARCHITECTURE_FA.md`
- راهنمای مهاجرت: `docs/CSS_MIGRATION_GUIDE_FA.md`
