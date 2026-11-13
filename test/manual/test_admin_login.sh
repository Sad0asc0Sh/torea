#!/bin/bash
# Manual smoke test for admin login redirect fix
# This script tests that /admin/login no longer redirects to /login

echo "=== Admin Login Redirect Fix - Manual Test ==="
echo ""
echo "Testing admin routes..."
echo ""

# Note: This requires the server to be running
# Start server with: npm start

# Test 1: /admin/login should return 200 (login page)
echo "1. Testing GET /admin/login (should return 200, not redirect)"
curl -s -o /dev/null -w "Status: %{http_code}, Redirect: %{redirect_url}\n" http://localhost:3000/admin/login
echo ""

# Test 2: /admin without session should redirect to /admin/login
echo "2. Testing GET /admin (should redirect to /admin/login)"
curl -s -o /dev/null -w "Status: %{http_code}, Redirect: %{redirect_url}\n" http://localhost:3000/admin
echo ""

# Test 3: /admin/dashboard without session should redirect to /admin/login
echo "3. Testing GET /admin/dashboard (should redirect to /admin/login)"
curl -s -o /dev/null -w "Status: %{http_code}, Redirect: %{redirect_url}\n" http://localhost:3000/admin/dashboard
echo ""

# Test 4: /admin/definitions/teams without session should redirect to /admin/login
echo "4. Testing GET /admin/definitions/teams (should redirect to /admin/login)"
curl -s -o /dev/null -w "Status: %{http_code}, Redirect: %{redirect_url}\n" http://localhost:3000/admin/definitions/teams
echo ""

echo "=== Test Complete ==="
echo ""
echo "Expected Results:"
echo "  1. Status: 200 (login page rendered)"
echo "  2. Status: 302, Redirect: /admin/login OR /admin/dashboard"
echo "  3. Status: 302, Redirect: /admin/login"
echo "  4. Status: 302, Redirect: /admin/login"
echo ""
echo "IMPORTANT: All redirects should go to /admin/login, NEVER to /login"
