# راهنمای مهاجرت CSS (فارسی)

این راهنما توضیح می‌دهد چگونه استایل‌های قدیمی را به سیستم CSS چهارلایه‌ی جدید منتقل کنیم. هدف: کاهش پراکندگی کلاس‌ها، یکپارچگی theme و ساده‌سازی نگهداشت.

## مراحل کلی مهاجرت
1. **شناسایی وابستگی‌ها:** فایل‌های قدیمی (`app-mobile.css`, `admin-ui.css`, فایل‌های page-level) را پیدا کنید.
2. **جایگزینی ورودی:** به‌جای لود مستقیم فایل‌های قدیمی، تنها `app.css` جدید را لود کنید.
3. **بازنگری کلاس‌ها:** از جدول mapping زیر برای جایگزینی کلاس‌های legacy استفاده کنید.
4. **تست theme-switch:** صفحه را با `data-theme="admin"` و `data-theme="user"` بررسی کنید.
5. **QA Responsive & RTL:** در breakpointهای موبایل و دسکتاپ و همچنین با جهت RTL مرورگر تست کنید.
6. **حذف باقی‌مانده‌ها:** کلاس‌های تعریف‌نشده یا inline-style را حذف و با utilities جدید جایگزین کنید.

## جدول mapping کلاس‌ها (نمونه)

| کلاس قدیمی | کلاس جدید | توضیح |
| ---------- | --------- | ----- |
| `.btn-primary` | `.btn btn--primary` | دکمه اصلی با کنتراست بالا |
| `.btn-secondary` | `.btn btn--secondary` | دکمه ثانویه |
| `.btn-text` | `.btn btn--ghost` | دکمه متنی با پس‌زمینه شفاف |
| `.card-box` | `.card` | کارت استاندارد |
| `.card-title` | `.card__title` | تیتر کارت |
| `.table-bordered` | `.table table--bordered` | جدول با خطوط دور |
| `.table-striped` | `.table table--striped` | جدول با پس‌زمینه راه‌راه |
| `.badge-info` | `.badge badge--info` | نشان اطلاع‌رسانی |
| `.badge-danger` | `.badge badge--danger` | نشان خطا/هشدار شدید |
| `.sidebar` | `.nav nav--drawer` | ناوبری کشویی کناری |
| `.navbar` | `.nav nav--top` | ناوبری بالای صفحه |
| `.mt-10px` | `mt-2` | فاصله عمودی مبتنی بر مقیاس متغیرها |
| `.p-16px` | `p-4` | فاصله داخلی استاندارد |

> نکته: در صورت وجود کلاس خاص صفحه، آن را به فایل متناظر در `4-views/` منتقل کنید تا override محلی باقی بماند.

## مثال قبل / بعد

### قبل (legacy)
```html
<div class="card-box">
  <div class="card-title">وضعیت سبد</div>
  <table class="table-bordered">
    <tr class="active"><td>...</td></tr>
  </table>
  <button class="btn-primary">تایید</button>
</div>
```

### بعد (معماری جدید)
```html
<div class="card spacing-md">
  <div class="card__title">وضعیت سبد</div>
  <div class="table-container">
    <table class="table table--bordered">
      <tr class="table__row--active"><td>...</td></tr>
    </table>
  </div>
  <button class="btn btn--primary">تایید</button>
</div>
```

## چک‌لیست مهاجرت
- [ ] همه صفحات فقط `app.css` را لود می‌کنند.
- [ ] کلاس‌های legacy با mapping جدید جایگزین شده‌اند.
- [ ] theme-switch روی `<html data-theme="admin|user">` کار می‌کند.
- [ ] فاصله‌بندی‌ها با مقیاس جدید (`mt-*`, `px-*`) هماهنگ شده‌اند.
- [ ] جداول در `table-container` قرار گرفته‌اند (برای اسکرول افقی امن).
- [ ] ناوبری از کلاس‌های `nav` جدید استفاده می‌کند.
- [ ] تست RTL و Responsive انجام شده است.
- [ ] رنگ‌ها فقط از CSS variables خوانده می‌شوند (بدون hardcode).

## مشکلات رایج و رفع آن‌ها
- **تعارض specificity:** در صورت باقی ماندن استایل inline یا `!important` قدیمی، آن‌ها را حذف یا به کلاس جدید منتقل کنید.
- **عدم بارگذاری فونت:** مسیر `/fonts/vazir/` و import فونت در `typography.css` را بررسی کنید.
- **جداول شکسته در موبایل:** از `.table-container` استفاده و حداقل عرض ستون‌ها را با `min-width` در جدول تنظیم کنید.
- **Spacing نامتوازن:** مقادیر ثابت پیکسلی را حذف و از کلاس‌های مقیاس‌یافته (`space` utilities) استفاده کنید.
- **Theme اعمال نمی‌شود:** مطمئن شوید `data-theme` روی `<html>` ست شده و کش مرورگر پاک است.
