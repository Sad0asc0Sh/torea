# Authentication & Redirect Bug Fix - Manual Verification Guide

## Overview
This document provides step-by-step instructions for manually verifying the authentication and redirect bug fix. All automated tests pass, but manual verification with a real database is recommended.

## Prerequisites
- PostgreSQL database set up and running
- Database migrations applied
- At least one normal user created in the system
- System admin account configured

## Test Scenarios

### Scenario 1: Normal User Login → Admin Dashboard
**Objective**: Verify normal users can access /admin UI after logging in via /login

**Steps**:
1. Open browser to http://localhost:3000/login
2. Enter normal user credentials (not system admin)
3. Click "ورود" (Login)
4. Complete 2FA authentication if prompted
5. Navigate to http://localhost:3000/admin/dashboard

**Expected Result**:
- ✅ User successfully logs in
- ✅ User is redirected to /admin/dashboard (or /pending if approval needed)
- ✅ User can see admin UI with appropriate menu items based on catalog permissions
- ❌ User is NOT redirected to /admin/login

**Failure Indicators**:
- User is redirected to /admin/login after successful /login
- User sees "System Admin Login" page instead of dashboard
- Session is lost when accessing /admin routes

---

### Scenario 2: Wrong Password on User Login
**Objective**: Verify wrong password stays on user login page

**Steps**:
1. Open browser to http://localhost:3000/login
2. Enter valid username
3. Enter WRONG password
4. Click "ورود" (Login)

**Expected Result**:
- ✅ Error message displayed: "نام کاربری یا رمز عبور اشتباه است"
- ✅ User remains on /login page (user login, not system admin login)
- ❌ User is NOT redirected to /admin/login

**Failure Indicators**:
- Redirect to /admin/login
- System admin login page displayed
- No error message shown

---

### Scenario 3: Unauthenticated Access to /admin
**Objective**: Verify unauthenticated requests redirect to user login

**Steps**:
1. Open browser in incognito/private mode (no session)
2. Navigate directly to http://localhost:3000/admin/dashboard
3. Observe redirect

**Expected Result**:
- ✅ Browser redirects to /login (user login)
- ✅ User sees "ورود کاربران" page
- ❌ User is NOT redirected to /admin/login

**Additional URLs to Test**:
- http://localhost:3000/admin
- http://localhost:3000/admin/definitions/users
- http://localhost:3000/admin/reports

All should redirect to /login

**Failure Indicators**:
- Redirect to /admin/login
- System admin login page displayed

---

### Scenario 4: System Admin Login Flow
**Objective**: Verify system admin login still works independently

**Steps**:
1. Open browser to http://localhost:3000/admin/login
2. Enter system admin credentials
3. Complete system admin 2FA (Telegram OTP)

**Expected Result**:
- ✅ System admin successfully logs in
- ✅ System admin is redirected to /admin/dashboard
- ✅ System admin sees full admin menu with all options
- ✅ System admin session is separate from user sessions

**Failure Indicators**:
- Cannot access /admin/login
- Redirect to /login instead
- 2FA not working

---

### Scenario 5: Logout Behavior
**Objective**: Verify logout redirects to correct login page

**Test 5A: Normal User Logout**:
1. Log in as normal user via /login
2. Navigate to /admin dashboard
3. Click "خروج" (Logout) from menu
4. Observe redirect

**Expected Result**:
- ✅ User redirects to /login (user login page)
- ❌ User does NOT redirect to /admin/login

**Test 5B: System Admin Logout**:
1. Log in as system admin via /admin/login
2. Click logout
3. Observe redirect

**Expected Result**:
- ✅ System admin redirects to /admin/login
- ❌ Does NOT redirect to /login

---

### Scenario 6: Catalog Permissions
**Objective**: Verify catalog permissions work correctly for normal users

**Steps**:
1. Log in as normal user with limited catalog permissions
2. Navigate to /admin/dashboard
3. Try to access a route NOT in user's catalog (e.g., /admin/definitions/users if not allowed)

**Expected Result**:
- ✅ User can access allowed routes
- ✅ User gets 403 Forbidden for disallowed routes (not redirect to /admin/login)
- ✅ Menu only shows items user has access to

**Failure Indicators**:
- Redirect to /admin/login for forbidden routes
- All menu items visible regardless of permissions

---

### Scenario 7: Session Persistence
**Objective**: Verify session persists across /admin routes

**Steps**:
1. Log in as normal user via /login
2. Navigate to /admin/dashboard
3. Navigate to /admin/reports
4. Navigate to /admin/tools
5. Refresh page

**Expected Result**:
- ✅ Session persists across all /admin routes
- ✅ No unexpected logouts
- ✅ No redirects to login pages

**Failure Indicators**:
- Session lost when navigating between /admin routes
- Redirected to login unexpectedly

---

## Quick Smoke Test Commands

If server is running, you can use these curl commands for quick verification:

```bash
# Test 1: /admin without auth → should redirect to /login
curl -s -o /dev/null -w "Status: %{http_code}, Location: %{redirect_url}\n" \
  http://localhost:3000/admin/dashboard

# Expected: Status: 302, Location: /login

# Test 2: /admin/login → should return 200
curl -s -o /dev/null -w "Status: %{http_code}\n" \
  http://localhost:3000/admin/login

# Expected: Status: 200

# Test 3: /login → should return 200
curl -s -o /dev/null -w "Status: %{http_code}\n" \
  http://localhost:3000/login

# Expected: Status: 200
```

## Common Issues and Troubleshooting

### Issue: "Database connection error"
**Solution**: Ensure PostgreSQL is running and DATABASE_URL is correct in .env

### Issue: "Session not persisting"
**Solution**: 
- Check SESSION_STORE setting
- Ensure session tables exist (user_sessions, admin_sessions)
- Clear browser cookies and try again

### Issue: "Catalog errors"
**Solution**: Run catalog sync: `npm run db:migrate` or check catalog service

## Success Criteria

All scenarios pass when:
- ✅ Normal users can access /admin UI after /login
- ✅ Wrong passwords stay on /login
- ✅ Unauthenticated /admin access redirects to /login
- ✅ System admin login works independently
- ✅ Logout redirects to correct login page
- ✅ Catalog permissions enforced without /admin/login redirects
- ✅ Sessions persist across /admin routes

## Regression Testing

After manual verification, ensure these existing features still work:
- User registration flow
- Telegram 2FA authentication
- Manager approval workflow
- Catalog-based menu filtering
- System admin setup (first-time)

## Contact

If you encounter issues during manual testing, check:
1. Server logs for errors
2. Browser console for client-side errors
3. Database for session data
4. Test results: `npm test -- test/auth_redirect_fix.test.js`
