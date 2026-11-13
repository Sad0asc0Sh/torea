#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
SERVER_JS="$APP_DIR/server.js"

if [ ! -f "$SERVER_JS" ]; then
  echo "server.js پیدا نشد در $SERVER_JS"
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo ".env پیدا نشد."
  exit 1
fi

DATABASE_URL=$(grep -E "^DATABASE_URL=" "$APP_DIR/.env" | sed "s/^DATABASE_URL=//")
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL در .env تنظیم نشده."
  exit 1
fi

echo "==> بکاپ گرفتن از server.js ..."
BACKUP="$APP_DIR/server.js.bak_$(date +%Y%m%d_%H%M%S)"
cp "$SERVER_JS" "$BACKUP"
echo "بکاپ در: $BACKUP"

echo "==> هماهنگ کردن ساختار جدول users ..."
psql "$DATABASE_URL" <<'SQL'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS position   TEXT,
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ALTER COLUMN role   SET DEFAULT 'USER',
  ALTER COLUMN active SET DEFAULT false,
  ALTER COLUMN status SET DEFAULT 'pending_verification';

-- از صفر شروع کنیم
DELETE FROM users;
SQL

echo "==> بازنویسی server.js ..."
cat <<'JS' > "$SERVER_JS"
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);

function getUser(req) {
  return req.session.user || null;
}

function requireAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect("/login");
  if (u.role !== "ADMIN") return res.status(403).send("Forbidden");
  next();
}

// ارسال کد به تلگرام
async function sendTelegramCode(chatIdOrUsername, code) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatIdOrUsername) return;
    const text = `کد احراز هویت شما در سامانه To infinity:\n${code}`;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatIdOrUsername, text }),
    });
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
}

app.get("/", (req, res) => res.redirect("/login"));

// فرم لاگین
app.get("/login", async (req, res) => {
  let firstRun = false;
  try {
    const q = await pool.query("SELECT COUNT(*)::int AS c FROM users");
    if (q.rows[0].c === 0) firstRun = true;
  } catch (e) {
    console.error("count users error:", e.message);
  }
  res.render("login", { error: null, firstRun });
});

// پردازش لاگین
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render("login", {
      error: "نام کاربری و رمز را وارد کنید.",
      firstRun: false,
    });
  }

  try {
    const q = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (!q.rows.length) {
      return res.render("login", {
        error: "نام کاربری یا رمز عبور اشتباه است.",
        firstRun: false,
      });
    }

    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render("login", {
        error: "نام کاربری یا رمز عبور اشتباه است.",
        firstRun: false,
      });
    }

    if (!user.active) {
      return res.render("login", {
        error: "حساب کاربری شما هنوز فعال نشده است. ابتدا احراز تلگرام لازم است.",
        firstRun: false,
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
    };

    return res.redirect("/admin/dashboard");
  } catch (err) {
    console.error(err);
    return res.render("login", {
      error: "خطای داخلی سیستم.",
      firstRun: false,
    });
  }
});

// فرم ثبت‌نام
app.get("/register", async (req, res) => {
  let isFirstUser = false;
  try {
    const q = await pool.query("SELECT COUNT(*)::int AS c FROM users");
    if (q.rows[0].c === 0) isFirstUser = true;
  } catch (e) {
    console.error("count users error:", e.message);
  }

  res.render("register", {
    error: null,
    form: {},
    isFirstUser,
  });
});

// پردازش ثبت‌نام
app.post("/register", async (req, res) => {
  const { first_name, last_name, phone, telegram_id, position, username, password } = req.body;
  const form = { first_name, last_name, phone, telegram_id, position, username };

  if (!first_name || !last_name || !phone || !telegram_id || !username || !password) {
    return res.render("register", {
      error: "همه فیلدهای ستاره‌دار را پر کنید.",
      form,
      isFirstUser: false,
    });
  }

  // رمز قوی: حداقل ۸ کاراکتر + حرف + عدد + علامت
  const passRegex =
    /^(?=.*[A-Za-zآ-ی])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

  if (!passRegex.test(password)) {
    return res.render("register", {
      error: "رمز عبور باید حداقل ۸ کاراکتر و شامل حرف، عدد و یک علامت خاص باشد.",
      form,
      isFirstUser: false,
    });
  }

  try {
    const exists = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
    if (exists.rows.length) {
      return res.render("register", {
        error: "این نام کاربری قبلاً استفاده شده است.",
        form,
        isFirstUser: false,
      });
    }

    const countQ = await pool.query("SELECT COUNT(*)::int AS c FROM users");
    const isFirstUser = countQ.rows[0].c === 0;

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(password, 10);
    const role = isFirstUser ? "ADMIN" : "USER";

    await pool.query(
      `INSERT INTO users
       (username, password_hash, first_name, last_name, phone, telegram_id, role, active, status, verification_code, position)
       VALUES
       ($1,$2,$3,$4,$5,$6,false,'pending_verification',$7,$8,$9)`,
      [username, hash, first_name, last_name, phone, telegram_id, role, code, position]
    );

    await sendTelegramCode(telegram_id, code);

    // Legacy /verify view removed; new flow uses /auth/telegram/* routes.
    return res.redirect("/auth/telegram?username=" + encodeURIComponent(username));
  } catch (err) {
    console.error(err);
    return res.render("register", {
      error: "خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.",
      form,
      isFirstUser: false,
    });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

const adminRoutes = require("./routes/admin");
app.use("/admin", requireAdmin, adminRoutes);

const PORT = process.env.APP_PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));
JS

echo "==> ری‌استارت bria-app توسط pm2 ..."
pm2 restart bria-app || pm2 restart all || true

echo "همه چیز انجام شد. جدول users ریست شد و لاگین/ثبت‌نام با هم هماهنگ شدند."
