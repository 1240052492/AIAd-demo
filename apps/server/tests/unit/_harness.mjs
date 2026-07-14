// Minimal zero-dependency test harness for the AdCraft robustness unit tests.
// Each test file imports { test, done } from here and calls done(import.meta.url) at the end.

let passed = 0
let failed = 0
const failures = []

export function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    const msg = e && e.message ? e.message : String(e)
    failures.push({ name, msg })
    console.log(`  \u2717 ${name}\n      ${msg}`)
  }
}

export function done(file) {
  const name = (file || '').split('/').pop() || 'tests'
  console.log(`\n[${name}] passed=${passed} failed=${failed}`)
  if (failed > 0) {
    console.log('  Failed assertions:')
    for (const f of failures) console.log(`   - ${f.name}: ${f.msg}`)
  }
  // reset for the next file (separate process per file, but be safe)
  process.exit(failed === 0 ? 0 : 1)
}
