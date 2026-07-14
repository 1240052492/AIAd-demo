// Exercises the REAL in-memory fixed-window rate limiter in
// apps/server/src/middleware/rate-limit.ts (imported directly via tsx).
// Verifies it blocks (429) once the per-window max is exceeded, and that
// different keys are counted independently.

import assert from 'node:assert/strict'
import { test, done } from './_harness.mjs'

const { rateLimit, loginLimiter, apiLimiter } = await import('../../src/middleware/rate-limit.ts')

function makeCtx(ip = '1.1.1.1') {
  const req = { ip }
  let statusCode = null
  let nextCalled = false
  const headers = {}
  const res = {
    headers,
    status(c) {
      statusCode = c
      return res
    },
    json(b) {
      res._body = b
      return res
    },
    // Express Response has setHeader; mirror it on the mock so the limiter can emit X-RateLimit-* headers.
    setHeader(name, value) {
      headers[name] = String(value)
      return res
    },
    getHeader(name) {
      return headers[name]
    },
  }
  const next = () => {
    nextCalled = true
  }
  return {
    req,
    res,
    next,
    get statusCode() {
      return statusCode
    },
    get nextCalled() {
      return nextCalled
    },
    get headers() {
      return headers
    },
  }
}

test('rateLimit: allows up to max, then 429 (custom 1s/3)', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 3 })
  for (let i = 1; i <= 3; i++) {
    const c = makeCtx()
    limiter(c.req, c.res, c.next)
    assert.equal(c.nextCalled, true, `request ${i} should pass`)
    assert.equal(c.statusCode, null)
  }
  const blocked = makeCtx()
  limiter(blocked.req, blocked.res, blocked.next)
  assert.equal(blocked.statusCode, 429, '4th request in window must be 429')
  assert.equal(blocked.nextCalled, false)
})

test('rateLimit: different IPs are counted independently', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 1 })
  const a = makeCtx('10.0.0.1')
  const b = makeCtx('10.0.0.2')
  limiter(a.req, a.res, a.next)
  limiter(b.req, b.res, b.next)
  assert.equal(a.nextCalled, true)
  assert.equal(b.nextCalled, true, 'second IP must not be affected by first IPs limit')
})

test('loginLimiter: allows 10, 11th is 429', () => {
  for (let i = 1; i <= 10; i++) {
    const c = makeCtx('login-client')
    loginLimiter(c.req, c.res, c.next)
    assert.equal(c.statusCode, null, `login ${i} should pass`)
  }
  const blocked = makeCtx('login-client')
  loginLimiter(blocked.req, blocked.res, blocked.next)
  assert.equal(blocked.statusCode, 429, '11th login in 15min window must be 429')
})

test('apiLimiter: allows 60, 61st is 429', () => {
  let blockedAt = -1
  for (let i = 1; i <= 61; i++) {
    const c = makeCtx('api-client')
    apiLimiter(c.req, c.res, c.next)
    if (c.statusCode === 429) {
      blockedAt = i
      break
    }
  }
  assert.equal(blockedAt, 61, 'api limiter max is 60, so the 61st should be blocked')
})

test('rate-limit: emits X-RateLimit-* headers and Retry-After on 429 (F8)', () => {
  const limiter = rateLimit({ windowMs: 1000, max: 2 })
  const pass = makeCtx()
  limiter(pass.req, pass.res, pass.next)
  assert.equal(pass.headers['X-RateLimit-Limit'], '2', 'limit header present on passing request')
  assert.ok(pass.headers['X-RateLimit-Remaining'] !== undefined, 'remaining header present')
  assert.ok(pass.headers['X-RateLimit-Reset'] !== undefined, 'reset header present')

  // exhaust the window
  limiter(makeCtx().req, makeCtx().res, makeCtx().next)
  const blocked = makeCtx()
  limiter(blocked.req, blocked.res, blocked.next)
  assert.equal(blocked.statusCode, 429)
  assert.ok(blocked.headers['Retry-After'] !== undefined, 'Retry-After header present on 429')
})

done(import.meta.url)
