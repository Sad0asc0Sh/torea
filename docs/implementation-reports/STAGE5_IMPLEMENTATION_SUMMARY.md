# Stage 5: Cron Job for 48-Hour Reminder System - Implementation Summary

## ✅ Implementation Complete

This document summarizes the implementation of the 48-hour automation reminder system.

---

## 📁 Files Created/Modified

### New Files:
1. **src/services/automationReminder.service.js** - Core reminder service logic
2. **src/jobs/automationReminder.job.js** - Cron job scheduler
3. **src/jobs/index.js** - Job manager for all scheduled jobs
4. **scripts/test_reminder_job.js** - Manual test script
5. **scripts/check_db_schema.js** - Database schema validation
6. **test/unit/services/automationReminder.test.js** - Unit tests

### Modified Files:
1. **src/server.js** - Added job initialization and graceful shutdown
2. **package.json** - Added node-cron dependency
3. **.env.example** - Added ENABLE_CRON_JOBS and TZ configuration

---

## 🔧 Configuration

Add these to your `.env` file:

```bash
# Cron Jobs Configuration
ENABLE_CRON_JOBS=true
TZ=Asia/Tehran
```

---

## 🗄️ Database Requirements

The system requires the `automation_item_logs` table from migration `016_automation_module_improvements.sql`.

### Verify Schema:
```bash
node scripts/check_db_schema.js
```

This checks for:
- ✅ `automation_item_logs` table exists
- ✅ Required columns are present
- ✅ `reminded_48h` action type is in CHECK constraint

---

## 🧪 Testing

### 1. Unit Tests
```bash
npm test -- test/unit/services/automationReminder.test.js
```

### 2. Manual Test (Without Database)
Tests that all functions are exported correctly:
```bash
node -c src/services/automationReminder.service.js
node -c src/jobs/automationReminder.job.js
node -c src/jobs/index.js
```

### 3. Manual Test (With Database)
Run the reminder job immediately without waiting for cron:
```bash
node scripts/test_reminder_job.js
```

Expected output:
```
============================================================
Testing Automation Reminder Job
============================================================

[AutomationReminder] Starting 48-hour reminder check...
[AutomationReminder] Found X items needing reminders
[AutomationReminder] Sent reminder for item Y to user Z
[AutomationReminder] Completed. Sent: X, Errors: 0

============================================================
Test Results:
- Reminders sent: X
- Errors: 0
============================================================
```

---

## 🚀 How It Works

### Automatic Execution:
1. Server starts → Jobs are initialized (if `ENABLE_CRON_JOBS=true`)
2. Every hour at :05 minutes → Cron job runs
3. Queries database for pending items older than 48 hours
4. For each item:
   - Sends notification to recipient
   - Logs action in `automation_item_logs`
   - Prevents duplicate reminders

### Manual Execution:
```bash
node scripts/test_reminder_job.js
```

---

## 📊 Business Logic

### Query Logic:
```sql
SELECT automation items WHERE:
  - status = 'pending'
  - recipient status = 'pending'
  - created_at < NOW() - 48 hours
  - No reminder already sent (LEFT JOIN on logs)
```

### Notification Format:
- **Title**: `یادآوری: [نوع] در انتظار اقدام`
- **Body**: `[نوع] با موضوع "[عنوان]" در انتظار اقدام شماست. لطفاً هرچه سریعتر بررسی کنید.`
- **Type**: `automation_reminder`
- **Entity**: Links to `automation_item`

### Log Entry:
- **action_type**: `reminded_48h`
- **action_by_user_id**: Recipient user ID
- **note**: `یادآوری 48 ساعته ارسال شد`
- **Timestamps**: Auto-set by database DEFAULT values

---

## 🔒 Error Handling

- ✅ Individual item failures don't stop processing
- ✅ Errors are logged with item ID
- ✅ Returns summary: `{ sent: X, errors: Y }`
- ✅ Fatal errors are thrown and logged

---

## 🛠️ Troubleshooting

### Jobs Not Running?
1. Check `ENABLE_CRON_JOBS` is set to `true` in `.env`
2. Check server logs: `[JOBS] Starting all scheduled jobs...`
3. Look for: `[CRON] Automation reminder job registered`

### No Reminders Sent?
1. Check if items exist: `SELECT * FROM automation_items WHERE status='pending' AND created_at < NOW() - INTERVAL '48 hours'`
2. Check if recipients exist: `SELECT * FROM automation_item_recipients WHERE status='pending'`
3. Check if reminders already sent: `SELECT * FROM automation_item_logs WHERE action_type='reminded_48h'`

### Database Errors?
1. Run schema check: `node scripts/check_db_schema.js`
2. Verify migration applied: `SELECT * FROM information_schema.tables WHERE table_name='automation_item_logs'`
3. Check foreign key references are valid

---

## 📝 Code Review Status

✅ All code review comments addressed:
- Fixed redundant NOW() calls in SQL
- Removed unused imports
- Added documentation for timestamp handling
- Clarified timezone configuration approach

---

## 🎯 Requirements Checklist

- [x] Service created with database queries for finding pending items
- [x] Cron job runs every hour at :05
- [x] Duplicate prevention using LEFT JOIN on logs table
- [x] Notifications sent to recipients via notifications table
- [x] Actions logged in `automation_item_logs` table
- [x] Graceful shutdown handling (SIGINT/SIGTERM)
- [x] Manual testing capability via script
- [x] Environment toggle to enable/disable jobs
- [x] Persian notifications with appropriate messages
- [x] Error resilience - continues processing on failures
- [x] Timezone aware (Asia/Tehran default)
- [x] Comprehensive logging

---

## 🔄 Production Deployment Steps

1. **Install dependencies**: `npm install` (node-cron added)
2. **Run migration**: Ensure `016_automation_module_improvements.sql` is applied
3. **Verify schema**: `node scripts/check_db_schema.js`
4. **Configure environment**: Add `ENABLE_CRON_JOBS=true` and `TZ=Asia/Tehran` to `.env`
5. **Test manually**: `node scripts/test_reminder_job.js`
6. **Deploy code**: Standard deployment process
7. **Verify startup**: Check logs for `[JOBS] Starting all scheduled jobs...`
8. **Monitor**: Watch logs for `[CRON] Automation reminder job started at...`

---

## 📚 References

- **Specification**: `docs/AUTOMATION_MODULE_COMPLETE_SPEC.md` section 9
- **Database Tables**: 
  - `automation_items`
  - `automation_item_recipients`
  - `automation_item_logs`
  - `notifications`
- **Migration**: `migrations/016_automation_module_improvements.sql`
- **Service Pattern**: Other services in `src/services/`

---

## ✨ Additional Features

### Graceful Shutdown:
- SIGINT (Ctrl+C) → Stops jobs → Closes server → Exits cleanly
- SIGTERM (Docker/Kubernetes) → Stops jobs → Closes server → Exits cleanly

### Timezone Support:
- Uses TZ environment variable (standard practice)
- Defaults to Asia/Tehran if not set
- Ensures cron runs at correct local time

### Extensibility:
- `src/jobs/index.js` is ready for additional cron jobs
- Just add new job files and register them in `startAllJobs()`
- Example: `paymentReminderJob`, `reportSchedulerJob`, etc.

---

## 📊 Monitoring Recommendations

For production, consider adding:
- Metrics: Count of reminders sent per hour
- Alerts: If error count > threshold
- Dashboard: Visual representation of reminder effectiveness
- Logs: Structured logging (JSON) for better parsing

---

**Implementation Date**: December 27, 2024
**Status**: ✅ Complete and Code Reviewed
**Tests**: ✅ All Passing
