import { prisma } from '../config'
import { ContentPolicyError, NotFoundError, ValidationError } from '../utils/errors'

export type ForbiddenAction = 'block' | 'flag' | 'replace'
export type ForbiddenMatchType = 'contains' | 'whole_word'

type ReviewMatch = {
  id: string
  word: string
  category: string
  action: ForbiddenAction
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

function isWordChar(value: string | undefined): boolean {
  return !!value && /[\p{L}\p{N}_]/u.test(value)
}

function hasLiteral(text: string, word: string, matchType: string): boolean {
  const haystack = normalized(text)
  const needle = normalized(word)
  if (!needle) return false
  if (matchType !== 'whole_word') return haystack.includes(needle)
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    const before = at > 0 ? haystack[at - 1] : undefined
    const after = haystack[at + needle.length]
    if (!isWordChar(before) && !isWordChar(after)) return true
    at = haystack.indexOf(needle, at + needle.length)
  }
  return false
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class ForbiddenWordService {
  async list() {
    return prisma.forbiddenWord.findMany({ orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }] })
  }

  async create(input: Record<string, unknown>) {
    const data = this.validate(input)
    const exists = await prisma.forbiddenWord.findUnique({ where: { word: data.word } })
    if (exists) throw new ValidationError('该词条已存在')
    return prisma.forbiddenWord.create({ data })
  }

  async update(id: string, input: Record<string, unknown>) {
    const existing = await prisma.forbiddenWord.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('违禁词不存在')
    return prisma.forbiddenWord.update({ where: { id }, data: this.validate({ ...existing, ...input }) })
  }

  async delete(id: string) {
    const existing = await prisma.forbiddenWord.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('违禁词不存在')
    await prisma.forbiddenWord.delete({ where: { id } })
  }

  async review(text: string, field: string): Promise<{ text: string; matches: ReviewMatch[] }> {
    if (!text) return { text, matches: [] }
    const rules = await prisma.forbiddenWord.findMany({ where: { enabled: true } })
    const matches: ReviewMatch[] = []
    let output = text
    for (const rule of rules.sort((a, b) => b.word.length - a.word.length)) {
      if (!hasLiteral(text, rule.word, rule.matchType)) continue
      const action = rule.action as ForbiddenAction
      matches.push({ id: rule.id, word: rule.word, category: rule.category, action })
      if (action === 'replace') {
        output = output.replace(new RegExp(escapeRegExp(rule.word), 'giu'), rule.replacement || '***')
      }
    }
    const blocked = matches.filter((item) => item.action === 'block')
    if (blocked.length) {
      throw new ContentPolicyError({
        field,
        matches: blocked.map(({ id, word, category, action }) => ({ id, word, category, action })),
      })
    }
    return { text: output, matches }
  }

  async assertObjectAllowed(value: unknown, field: string): Promise<void> {
    if (value === undefined || value === null) return
    let serialized = ''
    try {
      serialized = typeof value === 'string' ? value : JSON.stringify(value)
    } catch {
      throw new ValidationError(`${field} 无法序列化`)
    }
    await this.review(serialized, field)
  }

  private validate(input: Record<string, unknown>) {
    const word = String(input.word || '').trim()
    if (!word || word.length > 100) throw new ValidationError('词条长度应为 1-100 个字符')
    const matchType = String(input.matchType || 'contains') as ForbiddenMatchType
    if (!['contains', 'whole_word'].includes(matchType)) throw new ValidationError('匹配方式无效')
    const action = String(input.action || 'block') as ForbiddenAction
    if (!['block', 'flag', 'replace'].includes(action)) throw new ValidationError('处理策略无效')
    return {
      word,
      category: String(input.category || 'general').trim().slice(0, 50) || 'general',
      matchType,
      action,
      replacement: action === 'replace' ? String(input.replacement || '***').slice(0, 100) : null,
      enabled: input.enabled !== false,
    }
  }
}

export const forbiddenWordService = new ForbiddenWordService()
