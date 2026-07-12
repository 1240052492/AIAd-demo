/* DEPRECATED: settings/credit-rules 现已由 Prisma SystemSetting 支撑（见 system-setting.service.ts）。仅保留向后兼容。*/

import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')

/**
 * 每个文件一个串行化锁，防止并发 read-modify-write 丢失更新（Lost Update）。
 * 注意：此锁仅保证「单进程内」串行化。多进程 / 集群部署时，
 * 需改用外部锁（如 Redis 分布式锁）或直接将配置迁移到数据库表。
 */
const locks = new Map<string, Promise<unknown>>()

/**
 * 以 Promise 链实现的轻量互斥锁：同一 name 的多次操作按调用顺序串行执行。
 */
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(name) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((r) => (release = r))
  const chained = prev.then(() => next)
  locks.set(name, chained)
  return prev
    .then(() => fn())
    .finally(() => {
      release()
      // 仅当本链仍是当前记录的锁时清理，避免误删后续请求的锁
      if (locks.get(name) === chained) locks.delete(name)
    })
}

/**
 * 简单的 JSON 文件存储，用于保存没有独立数据库表的配置
 * （如积分规则 credit-rules、系统设置 settings）。
 */
export class JsonStore {
  static async read<T>(name: string, defaults: T): Promise<T> {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf-8')
      return { ...defaults, ...JSON.parse(raw) } as T
    } catch {
      return defaults
    }
  }

  /** 底层无锁写入，仅由 write / update 在文件锁内调用 */
  private static async writeRaw<T>(name: string, data: T): Promise<T> {
    await fs.mkdir(DATA_DIR, { recursive: true })
    await fs.writeFile(
      path.join(DATA_DIR, `${name}.json`),
      JSON.stringify(data, null, 2),
      'utf-8',
    )
    return data
  }

  /**
   * 写入数据（文件锁保护，串行化并发写入）。
   */
  static async write<T>(name: string, data: T): Promise<T> {
    return withLock(name, () => JsonStore.writeRaw(name, data))
  }

  /**
   * 原子更新：在文件锁内完成「读取 → 修改 → 写回」，调用方仅提供 mutator 变异当前数据。
   * 替代 `read()` + 修改 + `write()` 模式，从根本上消除并发丢失更新。
   * @param name 文件名（不含扩展名）
   * @param defaults 读取失败时的默认结构
   * @param mutator 接收当前数据，返回更新后的数据（可异步）
   */
  static async update<T>(
    name: string,
    defaults: T,
    mutator: (current: T) => T | Promise<T>,
  ): Promise<T> {
    return withLock(name, async () => {
      const current = await JsonStore.read(name, defaults)
      const updated = await mutator(current)
      return JsonStore.writeRaw(name, updated)
    })
  }
}
