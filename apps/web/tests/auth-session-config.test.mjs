import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const envText = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8')
const apiBaseMatch = envText.match(/^VITE_API_BASE_URL=(.*)$/m)

assert.equal(
  apiBaseMatch?.[1]?.trim(),
  '/api',
  'development auth must use the same-origin /api proxy so the refresh cookie survives page reloads',
)