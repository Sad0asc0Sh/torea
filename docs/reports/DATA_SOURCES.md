# منابع داده گزارشات

این سند جداول و مسیرهای موجود مرتبط با چهار حوزه‌ی ورودی گزارشات را خلاصه می‌کند. در جاهایی که جدول هنوز ساخته نشده است، وضعیت *placeholder* قید شده است تا خروجی گزارش با پیام «داده این بخش هنوز فعال نشده است» برگردد.

## A) دستیار آموزشی بازاریاب (Training)
- **training_company_settings**: baseline و threshold سیستم؛ فیلدهای زمانی `created_at`, `updated_at`.
- **training_topics**: `topic_key`, `title`, ترتیب (`order_index`)، حالت فعال (`is_enabled`)، پیکربندی prompt؛ کلیدهای زمانی `created_at`, `updated_at`.
- **user_training_state**: وضعیت کاربر (`user_id` PK/FK→users)، `user_level`, `difficulty_level`, `current_topic_key`, `cycle_id`، `updated_at`.
- **training_scores**: نتایج امتیاز (`user_id`, `topic_key`, `score`, `created_at`)، ایندکس روی `(user_id, topic_key, created_at DESC)`.
- **voice_enrollment**: ثبت صدای کاربر (`user_id`, `enrollment_version`, `embedding_json`, `updated_at`).

کلیدهای اصلی و زمانی:
- کلید کاربر: `user_id` (UUID).
- تایم‌استمپ: `created_at`, `updated_at` (trigger `set_updated_at`).

## B) کالاهای فراموش‌شده (Forgotten Products)
- جدول یا سرویس فعال در کد وجود ندارد. خروجی گزارش‌های مرتبط به صورت placeholder با پیام «داده این بخش هنوز فعال نشده است.» برمی‌گردد.

## C) اتوماسیون اداری (Automation)
- **automation_topics**: تعریف موضوعات (`id`, `title`, فلگ‌های `is_for_request/referral/announcement`, `sort_order`, `is_active`, `created_at`).
- **automation_items**: اقلام اتوماسیون (`id`, `item_type`, `topic_id`, `created_by_user_id`, گیرنده‌ها، `status`, `approver_user_id`, `decision_note`, `decided_at`, `created_at`).
- **automation_item_recipients**: نگاشت گیرنده‌ها (`item_id`, `user_id`, `read_at`).
- **notifications**: اعلان‌ها (`user_id`, `notif_type`, `title`, `body`, `entity_type`, `entity_id`, `is_read`, `created_at`).
- **admin_settings**: کلید-مقدار تنظیمات اتوماسیون/voice (`subject`, `key`, `value`, `created_at`, `updated_at`).

کلیدهای اصلی و زمانی:
- کاربران: `created_by_user_id`, `approver_user_id`, `user_id`.
- وضعیت‌ها: `status` (pending/approved/rejected/done).
- تایم‌استمپ: `created_at`, `updated_at/decided_at`.

## D) مانده فروشنده / اعتبار (Balance)
- **credit_sale_requests**: درخواست فروش اعتباری (`id`, `seller_user_id`, `requester_user_id`, `customer_code`, `customer_name`, `invoice_amount`, `due_date`, `final_status`, `approver1_node_id`, `approver2_node_id`, `finance_required`, `finance_user_id`, وضعیت‌های approvals، فیلدهای تصمیم مانند `decision_note`, `decided_at`, timestamps).
- **credit_settlement_requests**: تسویه‌ی درخواست‌های اعتباری (`id`, `credit_request_id`, `settlement_type`, `settlement_ref_no`, `status`, `requester_note`, `decision_note`, `decision_voice_path`, `created_at`, `updated_at`).
- **org_credit_policy**: سیاست اعتباری برای org_node (`org_node_id`, سقف‌های تعداد/مبلغ، `finance_user_id`, timestamps).
- **teams / user_team_assignment / team_users**: برای نگاشت تیم و org_node.

کلیدهای اصلی و زمانی:
- کاربران: `seller_user_id`, `requester_user_id`, `finance_user_id`.
- سازمان: `org_node_id`, `approver1_node_id`, `approver2_node_id`.
- تایم‌استمپ: `created_at`, `updated_at`, `due_date`, `decided_at`.

### TEAM Scope
برای داده‌های TEAM از رابطه‌ی سلسله‌مراتب کاربران (`users.manager_id`) استفاده می‌شود:
```sql
WITH RECURSIVE sub AS (
  SELECT id FROM users WHERE id = $1
  UNION ALL
  SELECT u.id FROM users u JOIN sub s ON u.manager_id = s.id
)
SELECT id FROM sub;
```
خروجی شامل خود کاربر نیز هست (پیش‌فرض).

### RIVALS Scope
هم‌رده‌ها (peers) از کاربران با `org_node_id` برابر با کاربر جاری و بدون خود کاربر استخراج می‌شوند:
```sql
SELECT id FROM users WHERE org_node_id = $1 AND id <> $2;
```

---

این سند مبنای متادیتای گزارشات و پیاده‌سازی placeholder است تا با توسعه‌ی بعدی Dataset Providerها به‌روز شود.
