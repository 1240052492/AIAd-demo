export function appUrl(path?: string): string | undefined {
  if (!path) return undefined
  if (/^(?:blob:|data:|https?:)/i.test(path)) return path
  return path.startsWith('/') ? path : `/${path}`
}

export function extractStoreName(input: string): string {
  const quoted = input.match(/[“"']([^”"']{2,40})[”"']/)?.[1]?.trim()
  if (quoted) return quoted
  const named = input.match(/(?:店名|品牌名|招牌名|名称)\s*[：:为叫]?\s*([\u4e00-\u9fa5A-Za-z0-9·.\-\s]{2,40})/)?.[1]?.trim()
  return named?.replace(/[，。,；;].*$/, '').trim() || '广告项目'
}

export function requestedVisibleTexts(input: string, explicitInput: string): string[] {
  const values = explicitInput
    .split(/\n|,/)
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter(Boolean)

  if (!values.length) {
    const quoted = Array.from(input.matchAll(/[“"「『]([^”"」』]{1,80})[”"」』]/g))
      .map((match) => match[1]?.trim())
      .filter(Boolean)
    values.push(...quoted)
  }

  const seen = new Set<string>()
  return values
    .filter((value) => {
      const key = value.toLocaleLowerCase().replace(/\s+/g, '')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

export function createVectorSvg(text: string): string {
  const safeText = text.replace(/[<>&"]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420"><rect width="1200" height="420" fill="#ffffff"/><text x="600" y="220" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="92" font-weight="700" fill="#111827">${safeText}</text><text x="600" y="305" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif" font-size="30" fill="#4b5563">矢量稿预览</text></svg>`
}
