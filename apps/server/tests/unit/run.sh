#!/usr/bin/env bash
# Runs the DB-free robustness unit tests with the project's managed Node + tsx.
# No Postgres / Redis required.
set -u

# repo root (Windows-style path for node)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." >/dev/null 2>&1 && pwd -W)"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
fi

NODE_EXE="C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2/node.exe"
TSX="$(ls "$ROOT"/node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs 2>/dev/null | head -1)"

if [ ! -x "$NODE_EXE" ]; then
  echo "managed node not found at $NODE_EXE" >&2; exit 1
fi
if [ -z "$TSX" ]; then
  echo "tsx not found under $ROOT/node_modules/.pnpm (run 'pnpm install' in apps/server)" >&2; exit 1
fi

SUITES=(
  "credit-concurrency.test.mjs"
  "validation.test.mjs"
  "rate-limit.test.mjs"
  "upload-buffer-probe.mjs"
)

pass=0
fail=0
for s in "${SUITES[@]}"; do
  echo "=============================================="
  echo ">>> $s"
  echo "=============================================="
  if "$NODE_EXE" "$TSX" "$ROOT/apps/server/tests/unit/$s"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
  fi
done

echo ""
echo "=============================================="
echo "Unit suites passed: $pass   failed: $fail"
echo "=============================================="
exit $fail
