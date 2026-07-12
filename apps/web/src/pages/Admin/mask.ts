/** 脱敏显示密钥：保留前缀与尾段，中间以 • 替代 */
export function maskKey(key: string): string {
  if (!key) return '—'
  if (key.length <= 8) return '•'.repeat(key.length)
  return `${key.slice(0, 6)}${'•'.repeat(8)}${key.slice(-4)}`
}
