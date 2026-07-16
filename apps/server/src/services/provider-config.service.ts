import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { env, prisma } from '../config'

const API_KEY_FIELD = 'apiKeyEncrypted'

type ProviderConfigJson = Record<string, unknown>

function encryptionKey(): Buffer {
  // JWT_SECRET is already required for authenticated admin access and provides a
  // stable development fallback. Production deployments should set PROVIDER_CONFIG_SECRET.
  return createHash('sha256')
    .update(process.env.PROVIDER_CONFIG_SECRET || env.jwtSecret)
    .digest()
}

export function encryptProviderSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptProviderSecret(value: string): string {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Provider API Key 密文格式无效')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivText, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

function configJson(value: unknown): ProviderConfigJson {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as ProviderConfigJson) }
    : {}
}

export function apiKeyStatus(value: unknown): { apiKeyConfigured: boolean; apiKeyMasked: string } {
  const key = typeof value === 'string' ? value : ''
  if (!key) return { apiKeyConfigured: false, apiKeyMasked: '' }
  return {
    apiKeyConfigured: true,
    apiKeyMasked: key.length <= 8 ? '••••••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`,
  }
}

export function encryptedApiKeyStatus(value: unknown): { apiKeyConfigured: boolean; apiKeyMasked: string } {
  if (typeof value !== 'string' || !value) return { apiKeyConfigured: false, apiKeyMasked: '' }
  return { apiKeyConfigured: true, apiKeyMasked: '••••••••' }
}

export async function getOpenAIImageProviderConfig() {
  const row = await prisma.aiProviderConfig.findFirst({
    where: { provider: 'openai_image' },
    select: { baseUrl: true, model: true, enabled: true, configJson: true },
  })
  const json = configJson(row?.configJson)
  let apiKey = ''
  if (typeof json[API_KEY_FIELD] === 'string') {
    try {
      apiKey = decryptProviderSecret(json[API_KEY_FIELD] as string)
    } catch {
      apiKey = ''
    }
  }
  return {
    enabled: row?.enabled ?? true,
    apiKey: apiKey || env.openaiImageApiKey,
    baseUrl: row?.baseUrl || env.openaiImageBaseUrl,
    model: row?.model || env.openaiImageModel,
  }
}

export function withApiKey(configJsonValue: unknown, apiKey: string): ProviderConfigJson {
  const json = configJson(configJsonValue)
  if (apiKey) json[API_KEY_FIELD] = encryptProviderSecret(apiKey)
  return json
}

export function removeSecretFields(value: unknown): ProviderConfigJson {
  const json = configJson(value)
  delete json[API_KEY_FIELD]
  return json
}
