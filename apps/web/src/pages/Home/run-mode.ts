export interface ProviderCapabilities {
  mock: boolean
  textGeneration: boolean
  imageGeneration: boolean
  composition: boolean
}

export function shouldAutoSelectMockMode(_capabilities: ProviderCapabilities | null): boolean {
  return false
}

