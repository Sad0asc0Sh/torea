#!/usr/bin/env bash
set -euo pipefail

### ========= تنظیمات شما =========
APP_NAME="bria-app"
APP_DIR="/opt/${APP_NAME}"
APP_PORT="3000"

DB_NAME="bria_db"
DB_USER="bria_user"

# ✅ پسورد مورد نظر شما:
DB_PASS_RAW="mah72432@#M"
ADMIN_USER="admin"
ADMIN_PASS="mah72432@#M"

# اگر دامنه داری بزن (اختیاری). اگر نداری خالی بگذار.
APP_DOMAIN=""  # مثلا: "app.example.com"
### ===============================

export DEBIAN_FRONTEND=noninteractive

# ✅ Encode کردن پسورد برای URL (چون @ و # داخل URL مشکل ایجاد می‌کند)
export DB_PASS_RAW
DB_PASS_URL="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ["DB_PASS_RAW"], safe=""))
PY
)"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS_URL}@127.0.0.1:5432/${DB_NAME}"
export DATABASE_URL

echo "==> Updating OS packages..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw build-essential nginx python3

# اگر قبلاً Apache نصب/اجرا شده باشد، با nginx روی پورت 80 تداخل می‌کند
systemctl disable --now apache2 >/dev/null 2>&1 || true

echo "==> Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib

echo "==> Enabling PostgreSQL..."
systemctl enable --now postgresql

echo "==> Creating/Updating DB user and database..."
sudo -u postgres psql <<SQL
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
      CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS_RAW}';
   ELSE
      ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS_RAW}';
   END IF;
END
\$\$;

SELECT format('CREATE DATABASE %I OWNER %I', '${DB_NAME}', '${DB_USER}')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='${DB_NAME}')\\gexec;

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

echo "==> Installing Node.js (LTS 20) + PM2..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm i -g pm2

echo "==> Creating app directory..."
mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

echo "==> Writing package.json..."
cat > package.json <<'JSON'
{
  "name": "bria-app",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "connect-pg-simple": "^9.0.1",
    "dotenv": "^16.4.5",
    "ejs": "^3.1.10",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "helmet": "^7.1.0",
    "pg": "^8.12.0"
  }
}
JSON

echo "==> Installing npm deps..."
npm install

echo "==> Writing .env..."
cat > .env <<ENV
APP_PORT=${APP_PORT}
SESSION_SECRET=$(openssl rand -hex 32)

# ✅ اینجا پسورد URL-Encode شده است و درست کار می‌کند
DATABASE_URL=${DATABASE_URL}
ENV

echo "==> Creating folders..."
mkdir -p views public/css

echo "==> Writing CSS (Vazir font via CDN)..."
cat > public/css/style.css <<'CSS'
@import url('https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css');
:root { --bg:#0b1220; --card:#121a2b; --text:#e8eefc; --muted:#9bb0d3; --accent:#ff4d6d; }
*{ box-sizing:border-box; }
html,body{ height:100%; }
body{
  margin:0;
  font-family: Vazirmatn, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: radial-gradient(1200px 600px at 20% 10%, #1a2a50 0%, var(--bg) 55%);
  color:var(--text);
  direction: rtl;
}
.container{ max-width: 980px; margin: 0 auto; padding: 28px 18px; }
.card{
  background: rgba(18,26,43,.92);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 16px 60px rgba(0,0,0,.35);
}
.row{ display:flex; gap:14px; flex-wrap:wrap; }
.col{ flex:1 1 280px; }
h1,h2{ margin:0 0 10px; }
p{ color:var(--muted); margin:8px 0 14px; }
a{ color:#9ad0ff; text-decoration:none; }
a:hover{ text-decoration:underline; }
label{ display:block; margin:10px 0 6px; color:var(--muted); font-size:14px; }
input{
  width:100%;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  color: var(--text);
  outline:none;
}
input:focus{ border-color: rgba(154,208,255,.55); }
.btn{
  display:inline-block;
  padding: 11px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(180deg, rgba(255,77,109,.95), rgba(255,77,109,.72));
  color: #fff;
  cursor:pointer;
  font-weight:700;
}
.btn:disabled{ opacity:.6; cursor:not-allowed; }
.topbar{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  margin-bottom:14px;
}
.badge{
  font-size:12px; padding:6px 10px; border-radius:999px;
  border:1px solid rgba(255,255,255,.12); color:var(--muted);
}
.error{
  background: rgba(255,77,109,.12);
  border: 1px solid rgba(255,77,109,.35);
  padding: 10px 12px;
  border-radius: 12px;
  margin: 10px 0 0;
}
CSS

echo "==> Writing views..."
cat > views/login.ejs <<'EJS'
<!doctype html><html lang="fa"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ورود</title><link rel="stylesheet" href="/css/style.css"/></head><body>
<div class="container"><div class="card">
<div class="topbar"><h1>ورود</h1><span class="badge">پنل داخلی</span></div>
<form method="POST" action="/login">
<label>نام کاربری</label><input name="username" autocomplete="username" required />
<label>رمز عبور</label><input name="password" type="password" autocomplete="current-password" required />
<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
<button class="btn" type="submit">ورود</button><a href="/register">ثبت‌نام</a></div>
<% if (error) { %><div class="error"><%= error %></div><% } %>
</form></div></div></body></html>
EJS

cat > views/register.ejs <<'EJS'
<!doctype html><html lang="fa"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ثبت‌نام</title><link rel="stylesheet" href="/css/style.css"/></head><body>
<div class="container"><div class="card">
<div class="topbar"><h1>ثبت‌نام</h1><span class="badge">ایجاد حساب</span></div>
<form method="POST" action="/register">
<div class="row">
<div class="col"><label>نام کاربری</label><input name="username" required /></div>
<div class="col"><label>نام</label><input name="first_name" required /></div>
<div class="col"><label>نام خانوادگی</label><input name="last_name" required /></div>
</div>
<div class="row">
<div class="col"><label>شماره موبایل</label><input name="phone" inputmode="tel" /></div>
<div class="col"><label>تلگرام (اختیاری)</label><input name="telegram_id" placeholder="@username" /></div>
</div>
<label>رمز عبور</label><input name="password" type="password" required />
<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
<button class="btn" type="submit">ثبت‌نام</button><a href="/login">بازگشت به ورود</a></div>
<% if (error) { %><div class="error"><%= error %></div><% } %>
</form></div></div></body></html>
EJS

cat > views/index.ejs <<'EJS'
<!doctype html><html lang="fa"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>داشبورد</title><link rel="stylesheet" href="/css/style.css"/></head><body>
<div class="container"><div class="card">
<div class="topbar">
<div><h1>داشبورد</h1><p>خوش آمدی <b><%= (((user.first_name||'') + ' ' + (user.last_name||'')).trim()) || user.username %></b> 👋</p></div>
<div style="display:flex;gap:10px;align-items:center;">
<span class="badge">نقش: <%= user.role %></span>
<a class="btn" href="/logout" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.16);">خروج</a>
</div></div>
<div class="row">
<div class="col card"><h2>وضعیت اتصال DB</h2><p>اگر این صفحه باز شده یعنی سرور و سشن کار می‌کند.</p></div>
<div class="col card"><h2>قدم بعدی</h2><p>اسکیما را دقیقاً مثل Access نهایی می‌کنیم و CRUD ها را می‌سازیم.</p></div>
</div>
</div></div></body></html>
EJS

echo "==> Writing SQL schema..."
cat > schema.sql <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  first_name text,
  last_name text,
  accounting_code text,
  phone text,
  telegram_id text,
  role text NOT NULL DEFAULT 'USER',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tbl_brand_managers (
  id bigserial PRIMARY KEY,
  telegram_id text,
  active boolean NOT NULL DEFAULT true,
  name text,
  phone text
);

CREATE TABLE IF NOT EXISTS tbl_senior_sales_managers (
  id bigserial PRIMARY KEY,
  telegram_id text,
  active boolean NOT NULL DEFAULT true,
  name text,
  phone text,
  brand_manager_id bigint REFERENCES tbl_brand_managers(id)
);

CREATE TABLE IF NOT EXISTS tbl_sales_managers (
  id bigserial PRIMARY KEY,
  telegram_id text,
  active boolean NOT NULL DEFAULT true,
  name text,
  phone text,
  senior_sales_manager_id bigint REFERENCES tbl_senior_sales_managers(id)
);

CREATE TABLE IF NOT EXISTS tbl_supervisors (
  id bigserial PRIMARY KEY,
  telegram_id text,
  active boolean NOT NULL DEFAULT true,
  name text,
  phone text,
  sales_manager_id bigint REFERENCES tbl_sales_managers(id)
);

CREATE TABLE IF NOT EXISTS tbl_sellers (
  id bigserial PRIMARY KEY,
  telegram_id text,
  active boolean NOT NULL DEFAULT true,
  name text,
  phone text,
  supervisor_id bigint REFERENCES tbl_supervisors(id)
);

CREATE TABLE IF NOT EXISTS tbl_brands (
  id bigserial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS tbl_products (
  id bigserial PRIMARY KEY,
  brand_id bigint REFERENCES tbl_brands(id),
  name text NOT NULL,
  sku text,
  active boolean NOT NULL DEFAULT true
);
SQL

echo "==> Applying schema..."
psql "${DATABASE_URL}" -f schema.sql

echo "==> Writing server.js..."
cat > server.js <<'JS'
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const pg = require('pg');
const pgSession = require('connect-pg-simple')(session);

const app = express();
const port = parseInt(process.env.APP_PORT || '3000', 10);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/css', express.static(__dirname + '/public/css'));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false }
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

app.get('/', (req, res) => req.session.user ? res.redirect('/dashboard') : res.redirect('/login'));

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query('SELECT id, username, password_hash, first_name, last_name, role, active FROM users WHERE username=$1', [username]);
    if (!r.rowCount) return res.status(401).render('login', { error: 'نام کاربری یا رمز عبور اشتباه است.' });
    const u = r.rows[0];
    if (!u.active) return res.status(403).render('login', { error: 'حساب شما غیرفعال است.' });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).render('login', { error: 'نام کاربری یا رمز عبور اشتباه است.' });
    req.session.user = { id: u.id, username: u.username, first_name: u.first_name, last_name: u.last_name, role: u.role };
    res.redirect('/dashboard');
  } catch {
    res.status(500).render('login', { error: 'خطای سرور. دوباره تلاش کن.' });
  }
});

app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', async (req, res) => {
  try {
    const { username, password, first_name, last_name, phone, telegram_id } = req.body;
    const exists = await pool.query('SELECT 1 FROM users WHERE username=$1', [username]);
    if (exists.rowCount) return res.status(409).render('register', { error: 'این نام کاربری قبلاً ثبت شده است.' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, first_name, last_name, phone, telegram_id, role) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [username, hash, first_name || null, last_name || null, phone || null, telegram_id || null, 'USER']
    );
    res.redirect('/login');
  } catch {
    res.status(500).render('register', { error: 'خطای سرور. دوباره تلاش کن.' });
  }
});

app.get('/dashboard', requireAuth, (req, res) => res.render('index', { user: req.session.user }));
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.listen(port, '0.0.0.0', () => console.log(`Running on :${port}`));
JS

echo "==> Seeding admin user (if not exists)..."
node - <<JS
require('dotenv').config();
const pg = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const username = "${ADMIN_USER}";
  const pass = "${ADMIN_PASS}";
  const first_name = "ادمین";
  const last_name = "سیستم";

  const r = await pool.query('SELECT 1 FROM users WHERE username=$1', [username]);
  if (r.rowCount === 0) {
    const hash = await bcrypt.hash(pass, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, first_name, last_name, role) VALUES ($1,$2,$3,$4,$5)',
      [username, hash, first_name, last_name, 'ADMIN']
    );
    console.log("Admin created:", username);
  } else {
    console.log("Admin already exists:", username);
  }
  await pool.end();
})();
JS

echo "==> Starting with PM2..."
pm2 start server.js --name "${APP_NAME}" --time
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> Opening firewall (UFW) for SSH + HTTP..."
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow ${APP_PORT}/tcp || true
ufw --force enable || true

echo "==> Nginx reverse proxy..."
cat > /etc/nginx/sites-available/${APP_NAME} <<NG
server {
    listen 80;
    server_name ${APP_DOMAIN:-_};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NG

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> DONE ✅"
echo "Try:  http://SERVER_IP/"
echo "Admin: ${ADMIN_USER} / ${ADMIN_PASS}"
