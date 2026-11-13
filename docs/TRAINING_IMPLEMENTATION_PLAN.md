# 📋 TRAINING MODULE - IMPLEMENTATION PLAN

این سند شامل **پلن مرحلهبهمرحله** پیادهسازی ماژول آموزش است.

---

## 🎯 نمای کلی

### هدف نهایی:
سیستم آموزش فروش کامل با:
- ✅ Training Progression Engine
- ✅ Negotiation Analysis با GPS
- ✅ Customer Visit History
- ✅ Forgotten Products Detection
- ✅ Manager Performance Dashboard
- ✅ Leaderboard & Gamification
- ✅ Telegram Integration

### زمانبندی کلی:
- **Phase 1:** Database & Core Engine (3-4 روز)
- **Phase 2:** Admin UI & Settings (2-3 روز)
- **Phase 3:** User UI & Dashboard (3-4 روز)
- **Phase 4:** GPS & Mobile Features (2-3 روز)
- **Phase 5:** Reports & Analytics (2-3 روز)
- **Phase 6:** Testing & Polish (2-3 روز)

**Total:** 14-20 روز کاری

---

## 📅 Phase 1: Database & Core Engine (3-4 روز)

### Day 1: Database Migration

**هدف:** اجرای migration و ایجاد جداول جدید.

#### Tasks:

1. **اجرای Migration 018** ✅
   ```bash
   psql -U postgres -d toinfinity -f migrations/018_training_module_enhancements.sql
   ```
   
   **Checklist:**
   - [ ] اجرای script
   - [ ] بررسی جداول جدید:
     - `product_industries`
     - `customer_visit_summary`
     - `manager_performance_cache`
   - [ ] بررسی ستون جدید:
     - `negotiation_analysis_reports.telegram_voice_file_id`
   - [ ] تست Trigger `update_customer_visit_summary`
   - [ ] تست Function `calculate_distance`

2. **Seed Data برای product_industries** ✅
   ```sql
   -- نمونه داده برای تست
   INSERT INTO product_industries (product_id, industry_id, is_strategic, priority)
   VALUES 
     (1, 5, TRUE, 1),  -- روغن برای رستوران
     (2, 5, TRUE, 2),  -- نوشابه برای رستوران
     (3, 8, TRUE, 1);  -- محصول برای سوپرمارکت
   ```

3. **تست Trigger** ✅
   ```sql
   -- Insert یک گزارش test
   INSERT INTO negotiation_analysis_reports 
     (created_by_user_id, customer_code, customer_name, started_at, ended_at, 
      duration_seconds, score, created_at)
   VALUES 
     (1, 'TEST-001', 'مشتری تست', NOW(), NOW(), 120, 75, NOW());
   
   -- بررسی customer_visit_summary
   SELECT * FROM customer_visit_summary WHERE customer_code = 'TEST-001';
   ```

**تخمین زمان:** 4-6 ساعت

---

### Day 2: Forgotten Products Service

**هدف:** ایجاد service تشخیص کالاهای فراموش شده.

#### Tasks:

1. **ایجاد `src/services/forgottenProducts.service.js`** ✅
   
   **Functions:**
   ```javascript
   async function detectForgottenProducts(transcript, customerIndustryId)
   async function saveForgottenProducts(userId, customerId, forgottenProducts, voiceLogId)
   async function getRecentForgottenProducts(userId, customerCode, days = 7)
   ```

2. **تست یونیت** ✅
   ```javascript
   // test/services/forgottenProducts.test.js
   describe('Forgotten Products Service', () => {
     it('should detect forgotten products', async () => {
       const result = await detectForgottenProducts(
         'سلام، محصول A را معرفی کردم',
         5  // رستوران
       );
       
       expect(result).toContainEqual({
         product_name: 'روغن X'  // فراموش شده
       });
     });
   });
   ```

**تخمین زمان:** 3-4 ساعت

---

### Day 3: Customer Visit History Service

**هدف:** ایجاد service جستجو و تاریخچه مشتری.

#### Tasks:

1. **ایجاد `src/services/customerVisitHistory.service.js`** ✅
   
   **Functions:**
   ```javascript
   async function searchCustomers(query)
   async function getCustomerHistory(customerCode)
   async function getCustomerNearby(lat, lng, radius)
   ```

2. **تست Integration** ✅
   ```javascript
   // test/services/customerVisitHistory.test.js
   describe('Customer Visit History', () => {
     it('should search customers by name', async () => {
       const results = await searchCustomers('پارس');
       expect(results.length).toBeGreaterThan(0);
       expect(results[0]).toHaveProperty('customer_code');
     });
   });
   ```

**تخمین زمان:** 3-4 ساعت

---

### Day 4: Integration با Training Engine

**هدف:** یکپارچهسازی services جدید با training.engine.js موجود.

#### Tasks:

1. **بروزرسانی `src/services/training.engine.js`** ✅
   
   **تغییرات:**
   ```javascript
   // در processVoice()
   if (meta.tool === 'negotiation' && meta.customerIndustryId) {
     const forgotten = await forgottenProducts.detectForgottenProducts(
       transcript,
       meta.customerIndustryId
     );
     
     outputs.missed_strategic_products = forgotten;
   }
   ```

2. **تست End-to-End** ✅
   ```javascript
   const result = await trainingEngine.processVoice({
     userId: 'test-user',
     transcript: 'سلام، محصول A را معرفی کردم',
     meta: {
       tool: 'negotiation',
       customerIndustryId: 5,
       customerCode: 'CUST-1234'
     }
   });
   
   expect(result.outputs.missed_strategic_products).toBeDefined();
   ```

**تخمین زمان:** 4-5 ساعت

---

## 📅 Phase 2: Admin UI & Settings (2-3 روز)

### Day 5: Admin Training Config UI

**هدف:** صفحه تنظیمات Training برای Admin.

#### Tasks:

1. **Route:** `/admin/settings/training-config` ✅
   
   **File:** `src/routes/admin/settings/trainingConfig.routes.js`
   
   ```javascript
   router.get('/', async (req, res) => {
     const settings = await trainingRepo.getCompanyTrainingSettings();
     res.render('admin/settings/training_config', { settings });
   });
   
   router.post('/save', async (req, res) => {
     await trainingRepo.saveCompanyTrainingSettings(req.body);
     res.json({ ok: true });
   });
   ```

2. **View:** `src/views/admin/settings/training_config.ejs` ✅
   
   **Form fields:**
   - baseline_voices_count
   - rolling_window_n
   - threshold_score

**تخمین زمان:** 3-4 ساعت

---

### Day 6: Admin Topics Management

**هدف:** صفحه مدیریت موضوعات آموزشی (CRUD + Reorder).

#### Tasks:

1. **Route:** `/admin/settings/training-topics` ✅
   
   **Endpoints:**
   - `GET /` - لیست
   - `POST /create` - ایجاد
   - `POST /:id/update` - ویرایش
   - `POST /:id/delete` - حذف
   - `POST /reorder` - تغییر ترتیب
   - `POST /test` - تست AI

2. **View:** `src/views/admin/settings/training_topics.ejs` ✅
   
   **Features:**
   - لیست موضوعات با Drag & Drop
   - Modal برای Create/Edit
   - دکمه Test AI

3. **JavaScript:** `public/js/admin/training-topics.js` ✅
   
   **Functions:**
   - Drag & Drop (با Sortable.js)
   - AJAX برای CRUD
   - Test AI Modal

**تخمین زمان:** 5-6 ساعت

---

### Day 7: Polish Admin UI

**هدف:** بهبود UI و UX صفحات Admin.

#### Tasks:

1. **CSS Styling** ✅
   - `public/css/admin/training-settings.css`
   - Responsive design
   - Loading states
   - Error messages

2. **Validation** ✅
   - Client-side validation
   - Server-side validation
   - Error handling

**تخمین زمان:** 3-4 ساعت

---

## 📅 Phase 3: User UI & Dashboard (3-4 روز)

### Day 8: User Dashboard

**هدف:** داشبورد اصلی کاربر.

#### Tasks:

1. **Route:** `/user/training/dashboard` ✅
   
   **File:** `src/routes/user/training.routes.js`
   
   **Data:**
   ```javascript
   const metrics = {
     today: await getMetrics(userId, 'today'),
     week: await getMetrics(userId, 'week'),
     training: await getUserTrainingState(userId),
     recent_visits: await getRecentVisits(userId, 5)
   };
   ```

2. **View:** `src/views/user/training/dashboard.ejs` ✅
   
   **Sections:**
   - کارتهای Metrics (امروز، هفته، ماه، رتبه)
   - پیشرفت آموزشی (Progress bar + Topics)
   - تمرینهای پیشنهادی
   - مذاکرات اخیر

3. **CSS:** `public/css/user/training-dashboard.css` ✅

**تخمین زمان:** 6-7 ساعت

---

### Day 9: Customer Search & History

**هدف:** جستجوی مشتری و تاریخچه مراجعات.

#### Tasks:

1. **Routes:** ✅
   - `GET /user/customers/search`
   - `GET /user/customers/:code/history`

2. **Views:** ✅
   - `src/views/user/training/customer_search.ejs`
   - `src/views/user/training/customer_history.ejs`

3. **AJAX Search:** ✅
   ```javascript
   // public/js/user/customer-search.js
   $('#searchInput').on('input', debounce(async function() {
     const query = $(this).val();
     const response = await fetch(`/user/customers/search?q=${query}`);
     const data = await response.json();
     renderResults(data.customers);
   }, 300));
   ```

**تخمین زمان:** 5-6 ساعت

---

### Day 10: User Progress & Leaderboard

**هدف:** صفحه پیشرفت من و رتبهبندی.

#### Tasks:

1. **Route:** `/user/training/progress` ✅
   
   **View:** نمایش تمام موضوعات + امتیازات + نمودار

2. **Route:** `/user/leaderboard` ✅
   
   **Tabs:**
   - تیم من
   - شاخه
   - کل شرکت
   
   **Query:**
   ```sql
   WITH ranked AS (
     SELECT 
       user_id,
       AVG(score) AS avg_score,
       COUNT(*) AS total_visits,
       RANK() OVER (ORDER BY AVG(score) DESC) AS rank
     FROM negotiation_analysis_reports
     WHERE created_at >= NOW() - INTERVAL '30 days'
     GROUP BY user_id
   )
   SELECT * FROM ranked ORDER BY rank ASC LIMIT 10;
   ```

**تخمین زمان:** 4-5 ساعت

---

### Day 11: User Voice Recording UI

**هدف:** صفحه ساده ضبط تمرین برای User.

#### Tasks:

1. **Route:** `/user/training/record` ✅

2. **View:** فرم ساده با دکمه Record ✅

3. **JavaScript:** `public/js/user/voice-recorder.js` ✅
   ```javascript
   // استفاده از MediaRecorder API
   navigator.mediaDevices.getUserMedia({ audio: true })
     .then(stream => {
       mediaRecorder = new MediaRecorder(stream);
       mediaRecorder.start();
     });
   ```

**تخمین زمان:** 4-5 ساعت

---

## 📅 Phase 4: GPS & Mobile Features (2-3 روز)

### Day 12: GPS Proximity Alert

**هدف:** نوتیفیکیشن وقتی کاربر نزدیک مشتری است.

#### Tasks:

1. **Service Worker** ✅
   
   **File:** `public/sw.js`
   
   ```javascript
   // Background geolocation tracking
   setInterval(async () => {
     const position = await getCurrentPosition();
     const nearby = await fetch('/api/customers/nearby', {
       method: 'POST',
       body: JSON.stringify({
         lat: position.coords.latitude,
         lng: position.coords.longitude,
         radius: 50
       })
     });
     
     if (nearby.length > 0) {
       showNotification(nearby[0]);
     }
   }, 60000);  // هر 1 دقیقه
   ```

2. **API Endpoint:** `/api/customers/nearby` ✅
   
   ```javascript
   router.post('/api/customers/nearby', async (req, res) => {
     const { lat, lng, radius } = req.body;
     
     const nearby = await pool.query(`
       SELECT 
         customer_code,
         customer_name,
         calculate_distance($1, $2, location_lat, location_lng) AS distance_m
       FROM customers
       WHERE calculate_distance($1, $2, location_lat, location_lng) <= $3
       ORDER BY distance_m ASC
       LIMIT 5
     `, [lat, lng, radius]);
     
     res.json({ nearby: nearby.rows });
   });
   ```

3. **Notification UI** ✅
   - Push notification
   - Bottom sheet با اطلاعات مشتری

**تخمین زمان:** 5-6 ساعت

---

### Day 13: Telegram Integration

**هدف:** ارسال گزارشات به تلگرام مدیر.

#### Tasks:

1. **Upload Voice to Telegram** ✅
   
   **Service:** `src/services/telegram.service.js`
   
   ```javascript
   async function uploadVoiceToTelegram(audioBuffer) {
     const form = new FormData();
     form.append('chat_id', process.env.TELEGRAM_STORAGE_CHAT_ID);
     form.append('voice', audioBuffer, 'voice.ogg');
     
     const response = await fetch(
       `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVoice`,
       { method: 'POST', body: form }
     );
     
     const data = await response.json();
     return data.result.voice.file_id;
   }
   ```

2. **Send Report to Manager** ✅
   ```javascript
   async function sendReportToManager(managerId, report) {
     const manager = await getManagerTelegramId(managerId);
     
     const message = `
   🔔 گزارش مذاکره جدید
   
   👤 فروشنده: ${report.seller_name}
   🏪 مشتری: ${report.customer_name}
   📊 امتیاز: ${report.score}/100
   ⚠️ فراموشی: ${report.forgotten_count} مورد
   
   خلاصه: ${report.summary_25}
     `;
     
     await sendTelegramMessage(manager.telegram_id, message);
   }
   ```

**تخمین زمان:** 4-5 ساعت

---

### Day 14: Mobile PWA Manifest

**هدف:** تبدیل به Progressive Web App.

#### Tasks:

1. **Manifest.json** ✅
   ```json
   {
     "name": "ToInfinity Training",
     "short_name": "Training",
     "start_url": "/user/training/dashboard",
     "display": "standalone",
     "theme_color": "#2563eb",
     "icons": [
       {
         "src": "/images/icon-192.png",
         "sizes": "192x192",
         "type": "image/png"
       }
     ]
   }
   ```

2. **Service Worker Registration** ✅
   ```javascript
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.register('/sw.js');
   }
   ```

**تخمین زمان:** 2-3 ساعت

---

## 📅 Phase 5: Reports & Analytics (2-3 روز)

### Day 15: Admin Team Report

**هدف:** گزارش عملکرد تیم برای مدیر.

#### Tasks:

1. **Route:** `/admin/reports/team` ✅

2. **Queries:** ✅
   ```sql
   -- خلاصه تیم امروز
   SELECT 
     COUNT(DISTINCT created_by_user_id) AS active_today,
     COUNT(*) AS total_visits,
     AVG(score) AS avg_score,
     COUNT(*) FILTER (WHERE score >= 70) AS successful
   FROM negotiation_analysis_reports
   WHERE created_by_user_id IN (
     SELECT id FROM users WHERE manager_id = $1
   )
   AND created_at >= CURRENT_DATE;
   
   -- لیست اعضا
   SELECT 
     u.id,
     u.first_name || ' ' || u.last_name AS name,
     COUNT(nar.id) AS today_visits,
     AVG(nar.score) AS today_avg_score,
     uts.user_level,
     uts.current_topic_key
   FROM users u
   LEFT JOIN negotiation_analysis_reports nar 
     ON nar.created_by_user_id = u.id 
     AND nar.created_at >= CURRENT_DATE
   LEFT JOIN user_training_state uts ON uts.user_id = u.id
   WHERE u.manager_id = $1
   GROUP BY u.id, uts.user_level, uts.current_topic_key;
   ```

3. **View:** `src/views/admin/reports/team.ejs` ✅

**تخمین زمان:** 5-6 ساعت

---

### Day 16: Manager Performance Cron Job

**هدف:** Job شبانه برای بروزرسانی cache عملکرد مدیران.

#### Tasks:

1. **Job:** `src/jobs/updateManagerPerformance.job.js` ✅
   
   ```javascript
   const schedule = require('node-schedule');
   
   schedule.scheduleJob('0 23 * * *', async () => {
     console.log('[Job] Updating manager performance cache...');
     
     const managers = await getAllManagers();
     
     for (const manager of managers) {
       const metrics = await calculateTeamMetrics(manager.id);
       await updateManagerCache(manager.id, metrics);
     }
   });
   ```

2. **اضافه به app.js** ✅
   ```javascript
   require('./jobs/updateManagerPerformance.job');
   ```

**تخمین زمان:** 3-4 ساعت

---

### Day 17: Forgotten Products Report

**هدف:** گزارش کالاهای پرتکرار فراموش شده.

#### Tasks:

1. **Route:** `/admin/reports/forgotten-products` ✅

2. **Query:** ✅
   ```sql
   SELECT 
     p.name AS product_name,
     ci.title AS industry_title,
     COUNT(*) AS forgotten_count,
     COUNT(DISTINCT nar.created_by_user_id) AS sellers_count
   FROM forgotten_key_products fkp
   JOIN products p ON p.id = fkp.product_id
   JOIN negotiation_analysis_reports nar ON nar.id = fkp.voice_log_id
   JOIN customer_industries ci ON ci.id = nar.customer_industry_id
   WHERE fkp.created_at >= NOW() - INTERVAL '30 days'
   GROUP BY p.id, p.name, ci.title
   ORDER BY forgotten_count DESC
   LIMIT 20;
   ```

3. **View:** نمایش جدول + نمودار ✅

**تخمین زمان:** 4-5 ساعت

---

## 📅 Phase 6: Testing & Polish (2-3 روز)

### Day 18: Unit Tests

**هدف:** تستهای یونیت برای Services.

#### Tasks:

1. **forgottenProducts.service.test.js** ✅
2. **customerVisitHistory.service.test.js** ✅
3. **training.engine.test.js** (بروزرسانی) ✅

**Framework:** Jest

**تخمین زمان:** 5-6 ساعت

---

### Day 19: Integration Tests

**هدف:** تستهای Integration برای Routes.

#### Tasks:

1. **admin/training.routes.test.js** ✅
2. **user/training.routes.test.js** ✅
3. **api/customers.routes.test.js** ✅

**Framework:** Supertest + Jest

**تخمین زمان:** 5-6 ساعت

---

### Day 20: Bug Fixes & Polish

**هدف:** رفع باگها و بهبود UX.

#### Tasks:

1. **Manual Testing** ✅
   - تست تمام flows
   - تست روی موبایل
   - تست GPS
   - تست Telegram

2. **Performance** ✅
   - بررسی Query های کند
   - اضافه کردن Index های لازم
   - کش کردن queries

3. **UI/UX Polish** ✅
   - Loading states
   - Error messages
   - Success messages
   - Animations

**تخمین زمان:** 6-8 ساعت

---

## ✅ Checklist نهایی

### Database:
- [ ] Migration 018 اجرا شده
- [ ] Trigger تست شده
- [ ] Function تست شده
- [ ] Seed data اضافه شده

### Backend:
- [ ] forgottenProducts.service.js
- [ ] customerVisitHistory.service.js
- [ ] telegram.service.js
- [ ] training.engine.js بروزرسانی شده
- [ ] همه Routes ساخته شده

### Frontend - Admin:
- [ ] Training Config UI
- [ ] Topics Management UI
- [ ] Team Report UI
- [ ] Forgotten Products Report

### Frontend - User:
- [ ] Dashboard
- [ ] Customer Search
- [ ] Customer History
- [ ] Progress Page
- [ ] Leaderboard
- [ ] Voice Recorder

### Mobile:
- [ ] GPS Proximity Alert
- [ ] Service Worker
- [ ] PWA Manifest
- [ ] Bottom Sheet

### Integration:
- [ ] Telegram Upload Voice
- [ ] Telegram Send Report
- [ ] Manager Performance Cron

### Testing:
- [ ] Unit Tests (>80% coverage)
- [ ] Integration Tests
- [ ] Manual Testing
- [ ] Mobile Testing

### Documentation:
- [ ] API Endpoints documented
- [ ] Database Schema documented
- [ ] UI Wireframes documented
- [ ] Implementation Plan (این فایل!)

---

## 🚀 آماده برای Production

### Pre-deployment Checklist:

1. **Environment Variables** ✅
   ```env
   TELEGRAM_BOT_TOKEN=your_token
   TELEGRAM_STORAGE_CHAT_ID=your_chat_id
   ```

2. **Database Backup** ✅
   ```bash
   pg_dump -U postgres toinfinity > backup_before_training.sql
   ```

3. **Run Migrations** ✅
   ```bash
   psql -U postgres -d toinfinity -f migrations/018_training_module_enhancements.sql
   ```

4. **Seed Initial Data** ✅
   ```sql
   -- Training settings
   -- Topics
   -- Product-Industry mappings
   ```

5. **Restart Server** ✅
   ```bash
   pm2 restart toinfinity
   ```

6. **Verify Cron Jobs** ✅
   ```bash
   pm2 logs toinfinity | grep "Manager Performance"
   ```

---

## 📞 نکات مهم

### Database:
- ⚠️ Trigger فقط INSERT را میگیرد (نه UPDATE)
- ⚠️ customer_visit_summary باید manually rebuild شود اگر داده قبلی وجود دارد
- ⚠️ manager_performance_cache روزانه بروزرسانی میشود

### GPS:
- ⚠️ دقت GPS برای proximity check: 50 متر
- ⚠️ Battery usage: moderate (check every 1 minute)
- ⚠️ Permission: geolocation must be granted

### Telegram:
- ⚠️ Voice files به صورت دائمی در تلگرام ذخیره میشوند
- ⚠️ file_id ها expire نمیشوند
- ⚠️ Rate limit: 30 messages/second

### Performance:
- ⚠️ customer_visit_summary کش است - برای real-time نیست
- ⚠️ Leaderboard queries سنگیناند - cache کنید
- ⚠️ Training Engine sync است - برای async نیست

---

## 📌 Document Metadata

- **Created**: 2025-12-27
- **Author**: smkhadivpoor
- **Version**: 1.0
- **Status**: Complete Implementation Plan
- **Estimated Total Time**: 14-20 روز کاری
