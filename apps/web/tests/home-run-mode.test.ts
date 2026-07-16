import assert from 'node:assert/strict'
import { shouldAutoSelectMockMode } from '../src/pages/Home/run-mode'

const mockedCapabilities = {
  mock: true,
  textGeneration: false,
  imageGeneration: false,
  composition: true,
}

assert.equal(shouldAutoSelectMockMode(mockedCapabilities), false)

