import { env, prisma } from '../config'
import { AppError } from '../utils/errors'
import { getOpenAIImageProviderConfig } from './provider-config.service'

export interface ProviderCapabilities {
  mock: boolean
  textGeneration: boolean
  imageGeneration: boolean
  composition: boolean
}

function isMockEnabled(): boolean {
  return env.nodeEnv !== 'production' || process.env.ALLOW_MOCK === 'true'
}

async function enabledProviders(): Promise<Set<string>> {
  const rows = await prisma.aiProviderConfig.findMany({
    where: { enabled: true },
    select: { provider: true },
  })
  return new Set(rows.map((row) => row.provider))
}

export async function getProviderCapabilities(): Promise<ProviderCapabilities> {
  const providers = await enabledProviders()
  const imageProvider = await getOpenAIImageProviderConfig()
  return {
    mock: isMockEnabled(),
    textGeneration: Boolean(env.anthropicApiKey) && providers.has('anthropic'),
    imageGeneration: Boolean(imageProvider.apiKey) && imageProvider.enabled && providers.has('openai_image'),
    composition: true,
  }
}

export async function requireTextProvider(): Promise<void> {
  const capabilities = await getProviderCapabilities()
  if (!capabilities.textGeneration) {
    throw new AppError('文本生成服务尚未配置或已停用，请联系管理员', 503, 503)
  }
}

export async function requireImageProvider(): Promise<void> {
  const capabilities = await getProviderCapabilities()
  if (!capabilities.imageGeneration) {
    throw new AppError('图片生成服务尚未配置或已停用，请联系管理员', 503, 503)
  }
}

export function allowMockRequest(requested: unknown): boolean {
  return requested === true && isMockEnabled()
}
