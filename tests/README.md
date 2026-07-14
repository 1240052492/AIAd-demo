# AdCraft AI — Robustness Test Plan

A systematic, layered approach to testing the robustness of the AdCraft AI backend
(`apps/server`). Three tiers, from zero-infra to full end-to-end.

## Tier 1 — DB-free unit tests (runs NOW, no Postgres/Redis)
Location: `apps/server/tests/unit/`

- `credit-concurrency.test.mjs` — reproduces the **credit over-freeze** concurrency
  defect (read-then-write under READ COMMITTED) and proves the atomic fix.
- `validation.test.mjs` — exercises the **real** Zod schemas in `utils/validation.ts`.
- `rate-limit.test.mjs` — exercises the **real** fixed-window limiter in
  `middleware/rate-limit.ts` (429 + per-key isolation).
- `upload-buffer-probe.mjs` — proves the **upload 500 bug**: `multer({ dest })`
  does not populate `req.file.buffer`, which `uploadAsset` reads.

Run:
```bash
bash apps/server/tests/unit/run.sh
```
(uses the workspace-managed Node + tsx; no install needed)

## Tier 2 — API black-box suite (needs a running server)
Location: `tests/api/robustness.sh`

Pure `bash` + `curl`, zero JS dependencies. Covers health, auth, credits,
projects + ownership/IDOR, AI input validation, image-jobs validation, public
templates, admin RBAC, and login rate limiting. Checks tagged `[KNOWN-BUG]`
assert the *secure* behaviour and will fail until the fixes in
`ROBUSTNESS-AUDIT.md` land.

Run (server already up via `pnpm dev` / docker compose):
```bash
BASE_URL=http://localhost:4177 bash tests/api/robustness.sh
```

## Tier 3 — Integration suite (needs Postgres + Redis)
Location: `tests/integration/robustness.spec.ts` (Supertest + Vitest)

Drives the **real** `app` end-to-end and includes a DB-backed credit-concurrency
regression test. Install deps and set env:
```bash
pnpm add -D -w vitest supertest @types/supertest
export DATABASE_URL=postgresql://.../ad_ai_test
export REDIS_URL=redis://127.0.0.1:6379
export JWT_SECRET=test-secret
npx vitest run apps/server/tests/integration
```

## Known failures (defects under test)
See `ROBUSTNESS-AUDIT.md` for the full findings table (P0/P1/P2) with file:line,
reproducers, and recommended fixes. Top items:
- **P0** Credit `freeze/consume/refund` not concurrency-safe → over-freeze / negative balance.
- **P0** Broken access control (IDOR) on `/projects/:id/assets`, `/versions`, `/export`
  and unattached `image-jobs` `projectId`.
- **P0** File upload 500s: `multer({ dest })` + reading `req.file.buffer`.
- **P1** Async credit compensation on the money path can leak/strand frozen credits.
