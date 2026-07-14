/**
 * AdCraft AI — Integration Robustness Suite (Supertest + Vitest)
 * ---------------------------------------------------------------------------
 * Requires a live PostgreSQL (test DB) and Redis. Set:
 *   DATABASE_URL=postgresql://.../ad_ai_test
 *   REDIS_URL=redis://127.0.0.1:6379
 *   JWT_SECRET=test-secret   (any non-default; not production)
 * then run from repo root:
 *   pnpm --filter @adcraft/server exec vitest run tests/integration
 *
 * Or (after installing dev deps):
 *   pnpm add -D -w vitest supertest @types/supertest
 *   npx vitest run apps/server/tests/integration
 *
 * This suite exercises the REAL Express app (src/app.ts) end-to-end and also
 * drives CreditService directly for the concurrency (over-freeze) regression.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import request from 'supertest'
import app from '../../apps/server/src/app'
import { prisma } from '../../apps/server/src/config'
import { creditService } from '../../apps/server/src/services/credit.service'

const BASE = '/api'

async function registerLogin(phone: string, password = 'secret1') {
  await request(app).post(`${BASE}/auth/register`).send({ phone, password }).catch(() => {})
  const res = await request(app).post(`${BASE}/auth/login`).send({ phone, password })
  const token: string = res.body?.data?.accessToken ?? res.body?.data?.token ?? ''
  return token
}

let userA = ''
let userB = ''
let projA = ''

beforeAll(async () => {
  userA = await registerLogin('1390000' + Math.floor(1000 + Math.random() * 8999))
  userB = await registerLogin('1390001' + Math.floor(1000 + Math.random() * 8999))
  const p = await request(app).post(`${BASE}/projects`).set('Authorization', `Bearer ${userA}`)
    .send({ title: 'A', businessType: 'poster' })
  projA = p.body?.data?.id ?? p.body?.id ?? ''
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('auth & guards', () => {
  it('rejects requests without token (401)', async () => {
    const r = await request(app).get(`${BASE}/auth/me`)
    expect(r.status).toBe(401)
  })
  it('accepts a valid token (200)', async () => {
    const r = await request(app).get(`${BASE}/auth/me`).set('Authorization', `Bearer ${userA}`)
    expect(r.status).toBe(200)
  })
  it('rejects a forged token (401)', async () => {
    const r = await request(app).get(`${BASE}/auth/me`)
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJoYWNrIn0.x')
    expect(r.status).toBe(401)
  })
})

describe('input validation (no model key required)', () => {
  it('POST /ai/brief missing businessType -> 400', async () => {
    const r = await request(app).post(`${BASE}/ai/brief`).set('Authorization', `Bearer ${userA}`)
      .send({ clientText: 'x' })
    expect(r.status).toBe(400)
  })
  it('POST /ai/brief clientText > 8000 -> 400', async () => {
    const r = await request(app).post(`${BASE}/ai/brief`).set('Authorization', `Bearer ${userA}`)
      .send({ businessType: 'poster', clientText: 'x'.repeat(9001) })
    expect(r.status).toBe(400)
  })
  it('POST /image-jobs missing prompt -> 400', async () => {
    const r = await request(app).post(`${BASE}/image-jobs`).set('Authorization', `Bearer ${userA}`)
      .send({ count: 1 })
    expect(r.status).toBe(400)
  })
})

describe('broken access control (IDOR) — fixed (assert 403)', () => {
  it('user B cannot read user A project detail', async () => {
    const r = await request(app).get(`${BASE}/projects/${projA}`).set('Authorization', `Bearer ${userB}`)
    expect(r.status).toBe(403)
  })
  it('user B cannot list user A project assets', async () => {
    const r = await request(app).get(`${BASE}/projects/${projA}/assets`).set('Authorization', `Bearer ${userB}`)
    expect(r.status).toBe(403)
  })
  it('user B cannot save a version into user A project', async () => {
    const r = await request(app).post(`${BASE}/projects/${projA}/versions`).set('Authorization', `Bearer ${userB}`)
      .send({ canvasJson: { x: 1 } })
    expect(r.status).toBe(403)
  })
})

describe('admin RBAC', () => {
  it('normal user cannot reach /admin/overview (403)', async () => {
    const r = await request(app).get(`${BASE}/admin/overview`).set('Authorization', `Bearer ${userA}`)
    expect(r.status).toBe(403)
  })
})

describe('credit concurrency — over-freeze regression (FAILS on current code)', () => {
  it('parallel freeze cannot drive balance negative', async () => {
    const email = 'conc_' + Date.now() + '@test.com'
    // create a user + account with balance 5 directly
    const u = await prisma.user.create({
      data: { email, passwordHash: 'x', status: 'active', roles: { create: { roleId: (await prisma.role.findUnique({ where: { code: 'user' } })).id } } },
    })
    await prisma.creditAccount.create({ data: { userId: u.id, balance: 5, frozenBalance: 0 } })

    // fire 10 parallel freezes of 1 credit each from a 5-credit account
    await Promise.all(Array.from({ length: 10 }, () => creditService.freeze(u.id, 1).catch(() => {})))

    const acct = await prisma.creditAccount.findUnique({ where: { userId: u.id } })
    // correct behaviour: balance never negative, and frozen == (5 - balance) <= 5
    expect(acct.balance).toBeGreaterThanOrEqual(0)
    expect(acct.frozenBalance).toBeLessThanOrEqual(5)
  })
})

describe('public templates', () => {
  it('GET /templates works without a token (200)', async () => {
    const r = await request(app).get(`${BASE}/templates`)
    expect(r.status).toBe(200)
  })
})
