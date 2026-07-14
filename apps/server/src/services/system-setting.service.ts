import { prisma } from '../config'

/**
 * 系统设置键值存储服务。
 *
 * SystemSetting 表的 `value` 字段以 JSON 字符串形式存放任意结构化配置，
 * 因此读取时需 JSON.parse、写入时需 JSON.stringify。
 * 约定：缺失的键由调用方提供的 fallback 兜底，避免上层因配置未初始化而崩溃。
 */
class SystemSettingService {
  /**
   * 按 key 读取系统设置。
   * @param key 设置键
   * @param fallback 缺失或解析失败时的兜底值
   * @returns 解析后的配置值（T）
   */
  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await prisma.systemSetting.findUnique({ where: { key } })
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return fallback
    }
  }

  /**
   * 写入（upsert）系统设置。
   * @param key 设置键
   * @param value 任意可序列化值；会被 JSON.stringify 后存入 value 字段
   */
  async set(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value)
    const now = new Date()
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: serialized, updatedAt: now },
      // 注意：system_settings 表曾因迁移漂移产生一个多余的驼峰 updatedAt 列（NOT NULL 无默认值），
      // 导致所有写入因该列拿到 NULL 而触发 P2011。该列已清理，此处 updatedAt 会正确写入 updated_at。
      create: { key, value: serialized, updatedAt: now },
    })
  }

  /**
   * 读取所有系统设置，聚合成 { key: 解析值 } 的扁平对象。
   */
  async list(): Promise<Record<string, unknown>> {
    const rows = await prisma.systemSetting.findMany()
    const result: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value)
      } catch {
        result[row.key] = row.value
      }
    }
    return result
  }
}

export const systemSettingService = new SystemSettingService()
