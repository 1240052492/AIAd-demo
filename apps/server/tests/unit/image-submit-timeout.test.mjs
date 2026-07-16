import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const configSource = fs.readFileSync(path.join(repoRoot, 'apps/server/src/config/index.ts'), 'utf8')
const workerSource = fs.readFileSync(path.join(repoRoot, 'apps/server/src/workers/image.worker.ts'), 'utf8')
const envText = fs.readFileSync(path.join(repoRoot, '.env'), 'utf8')

assert.match(envText, /^OPENAI_IMAGE_SUBMIT_TIMEOUT_MS=600000$/m)
assert.match(configSource, /openaiImageSubmitTimeoutMs:/)
assert.match(workerSource, /env\.openaiImageSubmitTimeoutMs/)
assert.doesNotMatch(workerSource, /imageService\.submitJob[\s\S]{0,160}\n\s*60_000,/)