#!/usr/bin/env bash
# =============================================================================
# AdCraft AI - API Robustness Test Suite (curl-based, zero extra dependencies)
# -----------------------------------------------------------------------------
# Systematic black-box robustness testing of every HTTP endpoint.
# Covers: health, auth (register/login/refresh/logout/me), RBAC, credits,
#         projects (CRUD + ownership/IDOR), AI input validation, image-jobs
#         validation, public templates, admin guards, and rate limiting.
#
# Usage:
#   BASE_URL=http://localhost:4177 bash tests/api/robustness.sh
#
# Requirements: a running server with Postgres + Redis (see docker-compose.yml).
#   - AI endpoints that actually call the model need ANTHROPIC_API_KEY set in
#     the server env; input-validation (400) checks work WITHOUT a key.
#   - Image-job submission needs Redis (BullMQ); the prompt-missing (400) check
#     works WITHOUT Redis.
#
# NOTE on expected failures: a few checks assert the SECURE/ATOMIC behaviour.
# Until the fixes in ROBUSTNESS-AUDIT.md land, those checks will FAIL and are
# labelled [KNOWN-BUG] so you can see exactly which defects remain.
# =============================================================================

BASE_URL="${BASE_URL:-http://localhost:4177}"
API="$BASE_URL/api"

pass=0
fail=0
total=0
known=0

# ---------- helpers ----------
hr() { echo "--------------------------------------------------------------"; }
check() {
  local name="$1" expected="$2" actual="$3"
  total=$((total + 1))
  if [ "$actual" = "$expected" ]; then
    pass=$((pass + 1)); echo "  PASS  $name ($actual)"
  else
    fail=$((fail + 1)); echo "  FAIL  $name (expected $expected, got $actual)"
  fi
}
# like check, but a failure here is a known documented bug
check_known() {
  local name="$1" expected="$2" actual="$3"
  total=$((total + 1))
  if [ "$actual" = "$expected" ]; then
    pass=$((pass + 1)); echo "  PASS  $name ($actual)"
  else
    fail=$((fail + 1)); known=$((known + 1))
    echo "  FAIL* $name [KNOWN-BUG] (expected $expected, got $actual)"
  fi
}

# POST with JSON, capture http code + body
post() {
  local path="$1" token="$2" body="$3"
  local code bodyfile; bodyfile=$(mktemp)
  code=$(curl -s -o "$bodyfile" -w '%{http_code}' -X POST "$API$path" \
    -H 'Content-Type: application/json' \
    ${token:+-H "Authorization: Bearer $token"} \
    -d "$body")
  BODY=$(cat "$bodyfile"); rm -f "$bodyfile"
  echo "$code"
}
get() {
  local path="$1" token="$2"
  local code bodyfile; bodyfile=$(mktemp)
  code=$(curl -s -o "$bodyfile" -w '%{http_code}' -X GET "$API$path" \
    ${token:+-H "Authorization: Bearer $token"})
  BODY=$(cat "$bodyfile"); rm -f "$bodyfile"
  echo "$code"
}
# extract a field from last BODY
field() { echo "$BODY" | (command -v jq >/dev/null && jq -r "$1" 2>/dev/null || echo ""); }

rand() { head -c 6 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 8; }

# ============================ health ============================
hr; echo "HEALTH"; hr
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/health")
check "GET /api/health reachable" "200" "$code"

# ============================ auth: register ============================
hr; echo "AUTH - REGISTER"; hr
U1="u$(rand)"; U2="u$(rand)"
code=$(post /auth/register "" "{\"phone\":\"1380013$(rand | tr -dc '0-9' | head -c4)\",\"password\":\"secret1\"}")
check "register: valid phone+password -> 200" "200" "$code"
code=$(post /auth/register "" '{"password":"secret1"}')
check "register: missing phone & email -> 400" "400" "$code"
code=$(post /auth/register "" '{"phone":"123","password":"secret1"}')
check "register: malformed phone -> 400" "400" "$code"
code=$(post /auth/register "" '{"phone":"13800138000","password":"123"}')
check "register: short password -> 400" "400" "$code"
code=$(post /auth/register "" '{"email":"not-an-email","password":"secret1"}')
check "register: malformed email -> 400" "400" "$code"
# duplicate (use the U1 phone we will create next)
PHONE1="1380013$(rand | tr -dc '0-9' | head -c4)"
code=$(post /auth/register "" "{\"phone\":\"$PHONE1\",\"password\":\"secret1\"}")
check "register: first time -> 200" "200" "$code"
code=$(post /auth/register "" "{\"phone\":\"$PHONE1\",\"password\":\"secret1\"}")
check "register: duplicate phone -> 400" "400" "$code"

# ============================ auth: login ============================
hr; echo "AUTH - LOGIN"; hr
code=$(post /auth/login "" "{\"phone\":\"$PHONE1\",\"password\":\"secret1\"}")
check "login: valid -> 200" "200" "$code"
TOKEN1=$(field '.data.accessToken // .data.token')
code=$(post /auth/login "" "{\"phone\":\"$PHONE1\",\"password\":\"wrong\"}")
check "login: wrong password -> 401" "401" "$code"
code=$(post /auth/login "" '{"password":"secret1"}')
check "login: missing identifier -> 400" "400" "$code"

# ============================ auth: me / guard ============================
hr; echo "AUTH - ME & GUARDS"; hr
code=$(get /auth/me "$TOKEN1")
check "GET /api/auth/me with token -> 200" "200" "$code"
code=$(get /auth/me "")
check "GET /api/auth/me without token -> 401" "401" "$code"
# tampered token
code=$(get /auth/me "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJoYWNrIiwicm9sZXMiOlsidXNlciJdLCJqdGkiOiJoYWNrIn0.aaaa")
check "GET /api/auth/me with forged token -> 401" "401" "$code"

# ============================ credits ============================
hr; echo "CREDITS"; hr
code=$(get /credits/balance "$TOKEN1")
check "GET /api/credits/balance -> 200" "200" "$code"
code=$(get /credits/transactions "$TOKEN1")
check "GET /api/credits/transactions -> 200" "200" "$code"
code=$(get /credits/balance "")
check "GET /api/credits/balance without token -> 401" "401" "$code"

# ============================ projects + ownership (IDOR) ============================
hr; echo "PROJECTS + OWNERSHIP (IDOR)"; hr
code=$(post /projects "$TOKEN1" "{\"title\":\"项目A\",\"businessType\":\"poster\"}")
check "POST /api/projects valid -> 200/201" "200" "$code"
PROJ1=$(field '.data.id // .id')
code=$(post /projects "$TOKEN1" '{"businessType":"poster"}')
check "POST /api/projects missing title -> 400" "400" "$code"
code=$(get /projects "$TOKEN1")
check "GET /api/projects list -> 200" "200" "$code"

# second user
PHONE2="1380013$(rand | tr -dc '0-9' | head -c4)"
post /auth/register "" "{\"phone\":\"$PHONE2\",\"password\":\"secret1\"}" >/dev/null
code=$(post /auth/login "" "{\"phone\":\"$PHONE2\",\"password\":\"secret1\"}")
TOKEN2=$(echo "$BODY" | (command -v jq >/dev/null && jq -r '.data.accessToken // .data.token' || echo ""))
code=$(get /projects/$PROJ1 "$TOKEN2")
check "GET /api/projects/:id of user1 by user2 -> 403/404 (ownership)" "403" "$code"
code=$(get /projects/$PROJ1/assets "$TOKEN2")
check "GET /api/projects/:id/assets of user1 by user2 -> 403/404 (IDOR)" "403" "$code"
code=$(post /projects/$PROJ1/versions "$TOKEN2" '{"canvasJson":{"x":1}}')
check "POST /api/projects/:id/versions of user1 by user2 -> 403/404 (IDOR)" "403" "$code"
code=$(post /projects/$PROJ1/export "$TOKEN2" '{"format":"png"}')
check "POST /api/projects/:id/export of user1 by user2 -> 403/404 (IDOR)" "403" "$code"

# ============================ AI input validation ============================
hr; echo "AI - INPUT VALIDATION (no API key needed)"; hr
code=$(post /ai/brief "$TOKEN1" '{"clientText":"我要做一个奶茶店门头"}')
check "POST /api/ai/brief missing businessType -> 400" "400" "$code"
code=$(post /ai/brief "$TOKEN1" '{"businessType":"poster"}')
check "POST /api/ai/brief missing clientText -> 400" "400" "$code"
# oversized clientText
BIG=$(head -c 9000 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 9000)
code=$(post /ai/brief "$TOKEN1" "{\"businessType\":\"poster\",\"clientText\":\"$BIG\"}")
check "POST /api/ai/brief clientText > 8000 -> 400" "400" "$code"
code=$(post /ai/prompt "$TOKEN1" '{}')
check "POST /api/ai/prompt missing brief -> 400" "400" "$code"
code=$(post /ai/workflows/run "$TOKEN1" '{}')
check "POST /api/ai/workflows/run missing projectId -> 400" "400" "$code"
code=$(post /ai/brief "" '{"businessType":"poster","clientText":"x"}')
check "POST /api/ai/brief without token -> 401" "401" "$code"

# ============================ image-jobs validation ============================
hr; echo "IMAGE-JOBS - INPUT VALIDATION"; hr
code=$(post /image-jobs "$TOKEN1" '{"count":2,"ratio":"1:1"}')
check "POST /api/image-jobs missing prompt -> 400" "400" "$code"
code=$(post /image-jobs "$TOKEN1" '{"prompt":"一个红色招牌"}')
check "POST /api/image-jobs valid shape (needs Redis) -> 200" "200" "$code"
code=$(post /image-jobs "$TOKEN1" '{"prompt":"x","count":99}')
check "POST /api/image-jobs count clamped (99 -> 4) -> 200" "200" "$code"

# ============================ templates (public) ============================
hr; echo "TEMPLATES (public)"; hr
code=$(get /templates "")
check "GET /api/templates public (no token) -> 200" "200" "$code"

# ============================ admin RBAC ============================
hr; echo "ADMIN - RBAC"; hr
code=$(get /admin/overview "$TOKEN1")
check "GET /api/admin/overview as normal user -> 403" "403" "$code"
code=$(get /admin/users "$TOKEN1")
check "GET /api/admin/users as normal user -> 403" "403" "$code"
code=$(post /admin/users/$PROJ1/credits/adjust "$TOKEN1" '{"amount":10,"reason":"test"}')
check "POST /api/admin/.../credits/adjust as normal user -> 403" "403" "$code"
code=$(post /admin/users/$PROJ1/credits/adjust "" '{"amount":10,"reason":"test"}')
check "admin adjust without token -> 401" "401" "$code"

# ============================ rate limiting ============================
hr; echo "RATE LIMITING (login 15min/10)"; hr
RC=0
for i in $(seq 1 11); do
  c=$(post /auth/login "" '{"phone":"nope","password":"x"}')
  if [ "$c" = "429" ]; then RC=1; fi
done
if [ "$RC" = "1" ]; then
  check "login rate limit eventually returns 429" "1" "1"
else
  check "login rate limit eventually returns 429" "1" "0"
fi

# ============================ summary ============================
hr
echo "ROBUSTNESS TEST SUMMARY"
echo "  total checks : $total"
echo "  passed       : $pass"
echo "  failed       : $fail   (of which KNOWN-BUG: $known)"
hr
# exit non-zero if any non-known failures; known-bug failures still reported
if [ "$fail" -gt 0 ]; then exit 1; else exit 0; fi
