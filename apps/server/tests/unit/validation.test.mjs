// Exercises the REAL input-validation schemas in
// apps/server/src/utils/validation.ts (imported directly via tsx).
// Confirms register/login accept valid input and reject bad input.

import assert from 'node:assert/strict'
import { test, done } from './_harness.mjs'

const { registerSchema, loginSchema } = await import('../../src/utils/validation.ts')

test('register: valid phone + password passes', () => {
  const r = registerSchema.safeParse({ phone: '13800138000', password: 'secret1' })
  assert.equal(r.success, true, 'valid registration should pass')
})

test('register: valid email + password passes', () => {
  const r = registerSchema.safeParse({ email: 'user@example.com', password: 'secret1' })
  assert.equal(r.success, true)
})

test('register: missing both phone and email fails', () => {
  const r = registerSchema.safeParse({ password: 'secret1' })
  assert.equal(r.success, false, 'must require phone or email')
})

test('register: malformed phone fails', () => {
  const r = registerSchema.safeParse({ phone: '123', password: 'secret1' })
  assert.equal(r.success, false, 'phone must match 1[3-9]\\d{9}')
})

test('register: malformed email fails', () => {
  const r = registerSchema.safeParse({ email: 'not-an-email', password: 'secret1' })
  assert.equal(r.success, false)
})

test('register: short password fails', () => {
  const r = registerSchema.safeParse({ phone: '13800138000', password: '123' })
  assert.equal(r.success, false, 'password must be >= 6')
})

test('register: oversized nickname fails', () => {
  const r = registerSchema.safeParse({ phone: '13800138000', password: 'secret1', nickname: 'x'.repeat(21) })
  assert.equal(r.success, false, 'nickname max 20')
})

test('login: valid phone passes', () => {
  const r = loginSchema.safeParse({ phone: '13800138000', password: 'x' })
  assert.equal(r.success, true)
})

test('login: missing both identifiers fails', () => {
  const r = loginSchema.safeParse({ password: 'x' })
  assert.equal(r.success, false)
})

test('login: missing password fails', () => {
  const r = loginSchema.safeParse({ email: 'user@example.com' })
  assert.equal(r.success, false, 'password min length 1')
})

done(import.meta.url)
