import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

function readEnvValue(filePath, name) {
  const text = fs.readFileSync(filePath, 'utf8')
  return text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() || ''
}

for (const file of ['.env', '.env.example']) {
  const baseUrl = readEnvValue(path.join(repoRoot, file), 'ANTHROPIC_BASE_URL')
  assert.match(
    baseUrl,
    /\/v1\/?$/,
    `${file} must point to the OpenAI-compatible /v1 API endpoint, not the provider web root`,
  )
}