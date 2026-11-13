# Quick Start Guide - 48-Hour Reminder System

## 🚀 Quick Setup (3 Steps)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Add to your `.env` file:
```bash
ENABLE_CRON_JOBS=true
TZ=Asia/Tehran
```

### 3. Start Server
```bash
npm start
```

You should see:
```
✅ ToInfinity running on http://127.0.0.1:3000
[JOBS] Starting all scheduled jobs...
[CRON] Automation reminder job registered (runs every hour at :05)
[JOBS] All jobs started successfully
```

---

## 🧪 Quick Test

Run the reminder job manually without waiting:
```bash
node scripts/test_reminder_job.js
```

---

## 📊 Check Database Schema
```bash
node scripts/check_db_schema.js
```

---

## ⚙️ How It Works

1. **Every hour at :05** → Cron job runs automatically
2. Finds all automation items:
   - Status: `pending`
   - Recipient status: `pending`
   - Created: > 48 hours ago
   - No reminder sent yet
3. For each item → Sends notification + Logs action
4. Prevents duplicates via database query

---

## 🔍 Monitor Logs

Look for these messages in your logs:

**Startup:**
```
[JOBS] Starting all scheduled jobs...
[CRON] Automation reminder job registered
```

**Hourly execution:**
```
[CRON] Automation reminder job started at 2024-12-27T20:05:00.000Z
[AutomationReminder] Found 5 items needing reminders
[AutomationReminder] Sent reminder for item 123 to user 456
[AutomationReminder] Completed. Sent: 5, Errors: 0
[CRON] Reminder job completed. Sent: 5, Errors: 0
```

---

## 🛠️ Troubleshooting

### Jobs not running?
Check environment variable:
```bash
echo $ENABLE_CRON_JOBS
```
Should output: `true`

### No reminders being sent?
Check if there are items older than 48 hours:
```sql
SELECT * FROM automation_items 
WHERE status='pending' 
AND created_at < NOW() - INTERVAL '48 hours';
```

### Database errors?
Run schema validation:
```bash
node scripts/check_db_schema.js
```

---

## 🎯 Key Files

| File | Purpose |
|------|---------|
| `src/services/automationReminder.service.js` | Core business logic |
| `src/jobs/automationReminder.job.js` | Cron job definition |
| `src/jobs/index.js` | Job manager |
| `scripts/test_reminder_job.js` | Manual testing |
| `scripts/check_db_schema.js` | Schema validation |

---

## 📝 Disable Jobs (Development)

To disable cron jobs during development:
```bash
ENABLE_CRON_JOBS=false
```

Or in `.env`:
```
ENABLE_CRON_JOBS=false
```

Jobs will not start, but you can still test manually with:
```bash
node scripts/test_reminder_job.js
```

---

## 🌐 Change Timezone

Default is `Asia/Tehran`. To change:
```bash
TZ=America/New_York
```

---

## 📚 Full Documentation

See `STAGE5_IMPLEMENTATION_SUMMARY.md` for complete documentation including:
- Architecture details
- Business logic
- Error handling
- Production deployment guide
- Monitoring recommendations

---

**Need Help?** Check the logs or run the test script for diagnostics.
