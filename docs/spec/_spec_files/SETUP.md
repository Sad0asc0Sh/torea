# ToInfinity - راهنمای نصب و راه‌اندازی

**⚠️ SPECIFICATION DOCUMENT - MAY BE OUTDATED**

This setup guide was created during planning. For **current setup instructions**, see:
- **[../../ARCHITECTURE_CURRENT.md - Development Setup](../../ARCHITECTURE_CURRENT.md#development-setup)** - Current setup instructions
- **[../../README.md](../../README.md)** - Documentation index

---

# ToInfinity - راهنمای نصب و راه‌اندازی (Spec Version)

## 📋 پیش‌نیازها

### نرم‌افزارهای مورد نیاز:
- **Node.js**: نسخه 18 یا بالاتر
- **PostgreSQL**: نسخه 14 یا بالاتر
- **npm** یا **yarn**: برای مدیریت پکیج‌ها
- **Docker** و **Docker Compose** (اختیاری ولی پیشنهادی)

### API Keys مورد نیاز:
- **Telegram Bot Token**: از [@BotFather](https://t.me/botfather) دریافت کنید
- **AI API Key**: OpenAI یا Grok API
- **Geocoding API**: برای تبدیل GPS به آدرس (اختیاری - OpenStreetMap رایگان است)

---

## 🚀 راه‌اندازی سریع با Docker

### 1. کلون کردن پروژه
```bash
git clone https://github.com/smkhadivpoor/ToInfintyForInfinity.git
cd ToInfintyForInfinity
```

### 2. تنظیمات محیطی
```bash
# کپی فایل نمونه
cp backend/.env.example backend/.env

# ویرایش فایل .env و تنظیم مقادیر زیر:
# - TELEGRAM_BOT_TOKEN=your_bot_token
# - JWT_SECRET=a_secure_random_string
# - OPENAI_API_KEY=your_openai_key (یا GROK_API_KEY)
```

### 3. ساخت و اجرا
```bash
docker-compose up -d
```

این دستور سه سرویس را اجرا می‌کند:
- **PostgreSQL** در پورت 5432
- **Backend API** در پورت 3000
- **Frontend PWA** در پورت 5173

### 4. دسترسی به برنامه
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api
- Health Check: http://localhost:3000/health

---

## 🛠️ نصب دستی (بدون Docker)

### Backend Setup

#### 1. نصب PostgreSQL
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql@14
brew services start postgresql@14

# Windows: دانلود از https://www.postgresql.org/download/
```

#### 2. ایجاد دیتابیس
```bash
# ورود به PostgreSQL
sudo -u postgres psql

# ایجاد دیتابیس و کاربر
CREATE DATABASE toinfinity;
CREATE USER toinfinity_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE toinfinity TO toinfinity_user;
\q

# اجرای schema
psql -U toinfinity_user -d toinfinity -f backend/database/schema.sql
```

#### 3. نصب و اجرای Backend
```bash
cd backend

# نصب dependencies
npm install

# کپی و تنظیم .env
cp .env.example .env
# ویرایش .env با تنظیمات دیتابیس و API keys

# اجرای development mode
npm run dev

# یا production mode
npm start
```

### Frontend Setup

#### 1. نصب و اجرای Frontend
```bash
cd frontend

# نصب dependencies
npm install

# اجرای development mode
npm run dev

# یا build برای production
npm run build
npm run preview
```

---

## 🔧 تنظیمات پیشرفته

### تنظیم Telegram Bot

1. به [@BotFather](https://t.me/botfather) پیام دهید
2. دستور `/newbot` را بزنید
3. نام و username ربات را وارد کنید
4. Token دریافت شده را در `.env` قرار دهید:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_BOT_USERNAME=YourBotUsername
   ```

### تنظیم AI API

#### OpenAI
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
```

#### Grok
```env
AI_PROVIDER=grok
GROK_API_KEY=your_grok_key
GROK_BASE_URL=https://api.grok.ai/v1
```

### تنظیم Redis (اختیاری برای Cache)

```bash
# نصب Redis
sudo apt install redis-server  # Ubuntu
brew install redis             # macOS

# اجرا
redis-server

# تنظیم در .env
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 📱 PWA Configuration

### تنظیم Service Worker

فایل `manifest.json` در `frontend/public/`:
```json
{
  "name": "ToInfinity",
  "short_name": "ToInfinity",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1976D2",
  "theme_color": "#1976D2",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 🧪 تست

### Backend Tests
```bash
cd backend
npm test                # اجرای تمام تست‌ها
npm run test:watch      # اجرای continuous
```

### Frontend Tests
```bash
cd frontend
npm test
```

---

## 📊 Monitoring و Logging

### Logs مشاهده
```bash
# Docker logs
docker-compose logs -f backend
docker-compose logs -f frontend

# نصب دستی
tail -f backend/logs/app.log
```

---

## 🔒 امنیت

### چک‌لیست امنیتی قبل از Production:

- [ ] تغییر `JWT_SECRET` به یک رشته تصادفی قوی
- [ ] تغییر `JWT_REFRESH_SECRET` به یک رشته تصادفی قوی
- [ ] تغییر پسورد دیتابیس
- [ ] فعال‌سازی HTTPS
- [ ] تنظیم `NODE_ENV=production`
- [ ] محدودسازی CORS به دامنه‌های معتبر
- [ ] فعال‌سازی rate limiting
- [ ] Backup منظم دیتابیس
- [ ] تنظیم firewall و security groups

---

## 🚢 استقرار Production

### با Docker

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# اجرا
docker-compose -f docker-compose.prod.yml up -d
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name toinfinity.example.com;
    
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location / {
        root /var/www/toinfinity/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 🐛 رفع مشکلات رایج

### مشکل: Database connection failed

**راه‌حل:**
- بررسی اجرای PostgreSQL: `sudo systemctl status postgresql`
- بررسی تنظیمات `.env` (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
- بررسی فایروال و دسترسی به پورت 5432

### مشکل: Telegram bot not responding

**راه‌حل:**
- بررسی صحت `TELEGRAM_BOT_TOKEN` در `.env`
- بررسی اینترنت سرور
- اجرای `/start` در ربات تلگرام

### مشکل: Frontend cannot connect to backend

**راه‌حل:**
- بررسی `VITE_API_URL` در تنظیمات frontend
- بررسی CORS settings در backend
- بررسی اجرای backend: `curl http://localhost:3000/health`

---

## 📚 مستندات بیشتر

برای اطلاعات تکمیلی:
- [SRS Requirements](./docs/02-SRS-Requirements.md)
- [Architecture](./docs/06-Architecture.md)
- [ERD](./docs/05-ERD.md)
- [UI/UX Wireframes](./docs/08-UI-UX-Wireframes.md)
- [API Documentation](./docs/API.md)

---

## 💬 پشتیبانی

برای سوالات و مشکلات:
- GitHub Issues: https://github.com/smkhadivpoor/ToInfintyForInfinity/issues
- Telegram: [Your Support Channel]
- Email: [Your Support Email]

---

**آخرین بروزرسانی**: 2024
**نسخه**: 1.0.0
