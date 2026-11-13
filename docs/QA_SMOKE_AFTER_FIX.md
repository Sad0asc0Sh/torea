# QA / Smoke After Fix

Script location: `/root/ToInfinity/QA_SMOKE_AFTER_FIX.sh` (also present at the repo root). Artifacts are written to `qa_smoke_logs/`.

## Prerequisites
- `pm2`, `curl`, `psql`, and `npm` available in `$PATH`
- `DATABASE_URL` set (or present in `.env`)
- App installed via `npm ci` so `npm test` can run

## Run
```bash
cd /root/ToInfinity   # or the repo directory
HOST=127.0.0.1 PORT=3000 bash QA_SMOKE_AFTER_FIX.sh
```

## What it checks
- Restarts pm2 app (tries `toinfinity`, falls back to `bria-app`/`all`), waits for `/healthz` = 200
- Clears pm2 logs, hits:
  - `/admin/definitions/teams`
  - `/admin/definitions/products`
  - `/admin/definitions/brands`
  - `/admin/definitions/credit-policy`
- `/admin/definitions/baskets` (should be gone → 410/404/301/302)
- Scans fresh PM2 logs for `error`/`uncaught`/`unhandled`
- DB schema: `teams` must contain `org_node_id`; `user_team_assignment` must contain `updated_at` and must NOT have `role`
- DB counts: `teams`, `team_users`, `user_team_assignment`, `products`
- Runs `npm test`; output saved to timestamped log

## Outputs
- Summary with PASS/FAIL per section
- Logs in `qa_smoke_logs/`:
  - `http-checks-<ts>.log`, `pm2-<ts>.log`, `db-checks-<ts>.log`, `npm-test-<ts>.log`

## If something fails
- **PM2/healthz**: `pm2 status`, ensure env vars/port are correct, inspect `pm2-<ts>.log`
- **HTTP endpoints**: confirm admin login (302 to `/admin/login` is acceptable for protected pages), recheck host/port
- **PM2 logs**: open the snapshot log and fix the underlying error before retrying
- **DB schema/counts**: verify `DATABASE_URL`, run the same queries in `db-checks-<ts>.log`; add missing columns if needed
- **npm test**: run `npm ci` first; review `npm-test-<ts>.log` for failing suites
