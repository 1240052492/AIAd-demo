import assert from 'node:assert/strict'
import { normalizeOpenAICompatibleBaseUrl } from '../../src/services/ai/anthropic.service.ts'

assert.equal(normalizeOpenAICompatibleBaseUrl('https://gateway.example.com'), 'https://gateway.example.com/v1')
assert.equal(normalizeOpenAICompatibleBaseUrl('https://gateway.example.com/'), 'https://gateway.example.com/v1')
assert.equal(normalizeOpenAICompatibleBaseUrl('https://gateway.example.com/v1'), 'https://gateway.example.com/v1')
assert.equal(normalizeOpenAICompatibleBaseUrl('https://gateway.example.com/v1/'), 'https://gateway.example.com/v1')
assert.equal(normalizeOpenAICompatibleBaseUrl(''), undefined)
process.exit(0)
