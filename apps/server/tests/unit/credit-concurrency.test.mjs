// Reproduces the credit freeze/consume concurrency defect found in
// apps/server/src/services/credit.service.ts (freeze / consume / refund).
//
// The methods do:  read balance (findUnique)  ->  check  ->  write (update)
// inside a Prisma $transaction. Under PostgreSQL READ COMMITTED (Prisma default),
// the initial SELECT takes NO row lock, so two concurrent transactions can BOTH
// read the stale (pre-commit) balance, BOTH pass the check, and BOTH decrement.
// Result: over-freeze / negative balance / double-spend. There is also NO
// CHECK (balance >= 0) constraint in schema.prisma to catch it at the DB layer.
//
// This is a faithful, dependency-free simulation of that algorithm. It runs the
// exact read-then-write ordering and forces the interleaving that READ COMMITTED
// permits. Then it demonstrates the atomic fix (conditional UPDATE ... WHERE
// balance >= amount) which the DB executes as a single locked statement.

import assert from 'node:assert/strict'
import { test, done } from './_harness.mjs'

// ---- tiny in-memory "db" + simulated transaction primitives ----
function makeDb(initialBalance) {
  return { balance: initialBalance, frozenBalance: 0 }
}

// yield to the event loop so the OTHER transaction can also run its read
function yieldToInterleave() {
  return new Promise((r) => setImmediate(r))
}

async function readAccount(db) {
  return { balance: db.balance } // plain SELECT, no lock (mirrors findUnique)
}
async function updateAccount(db, amount) {
  db.balance -= amount
  db.frozenBalance += amount
  return { balance: db.balance, frozenBalance: db.frozenBalance }
}
// atomic conditional update (the FIX): single UPDATE with WHERE balance >= amount
async function conditionalDecrement(db, amount) {
  if (db.balance >= amount) {
    db.balance -= amount
    db.frozenBalance += amount
    return 1
  }
  return 0
}

// ---- CURRENT (BUGGY) implementation: read-then-write ----
async function freezeBuggy(db, amount) {
  const account = await readAccount(db) // SELECT (no lock)
  await yieldToInterleave() // <- window where a sibling tx reads the same stale value
  if (account.balance < amount) throw new Error('可用积分不足')
  await updateAccount(db, amount)
}

// ---- FIXED implementation: conditional update ----
async function freezeFixed(db, amount) {
  const n = await conditionalDecrement(db, amount) // single atomic UPDATE ... WHERE balance >= amount
  if (n === 0) throw new Error('可用积分不足')
}

async function runTwoConcurrent(freezeFn) {
  const db = makeDb(10)
  const results = await Promise.allSettled([freezeFn(db, 8), freezeFn(db, 8)])
  return { db, results }
}

// ---------------- TESTS ----------------

test('single freeze (buggy) works when balance suffices', async () => {
  const db = makeDb(10)
  await freezeBuggy(db, 8)
  assert.equal(db.balance, 2)
  assert.equal(db.frozenBalance, 8)
})

test('BUG: concurrent freeze over-freezes and goes negative (no error thrown)', async () => {
  const { db, results } = await runTwoConcurrent(freezeBuggy)
  const bothSucceeded = results.every((r) => r.status === 'fulfilled')
  // 16 credits frozen out of an available 10 -> balance must be negative if the bug fires
  assert.ok(bothSucceeded, 'both freezes should "succeed" (no 400) under the bug')
  assert.ok(db.balance < 0, `balance should go negative, got ${db.balance}`)
  assert.equal(db.frozenBalance, 16, '16 credits frozen from a 10-credit account')
})

test('FIX: concurrent freeze cannot over-freeze (one succeeds, one is rejected)', async () => {
  const { db, results } = await runTwoConcurrent(freezeFixed)
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length
  const rejected = results.filter((r) => r.status === 'rejected').length
  assert.equal(fulfilled, 1, 'exactly one freeze should succeed')
  assert.equal(rejected, 1, 'the second freeze must be rejected as insufficient')
  assert.equal(db.balance, 2, 'balance stays correct')
  assert.equal(db.frozenBalance, 8, 'only 8 frozen')
})

done(import.meta.url)
