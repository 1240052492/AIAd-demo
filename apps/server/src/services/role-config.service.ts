import { prisma } from '../config'

/**
 * 角色权限与充值付款倍率配置
 *
 * 数据来源：role_configs 表（已种子数据）。服务端强制生效：
 * - rate：充值付款倍率（代理默认 0.7，即同等到账积分按 70% 付款）
 * - permissions：功能权限包（canGenerate / canAccessAdmin 等）
 * 前端任何"免积分/越权"绕过都无效，因为扣费与鉴权全部在后端完成。
 */
export interface RolePermission {
  canGenerate?: boolean
  canCompose?: boolean
  canAccessAdmin?: boolean
  canRecharge?: boolean
  canManageUsers?: boolean
  canExport?: boolean
  canPriority?: boolean
  canTeam?: boolean
}

const DEFAULT_RATES: Record<string, number> = {
  guest: 1,
  user: 1,
  agent: 0.7,
  admin: 1,
}

const DEFAULT_PERMISSIONS: Record<string, RolePermission> = {
  guest: { canGenerate: false, canCompose: false, canAccessAdmin: false, canRecharge: false, canManageUsers: false, canExport: false },
  user: { canGenerate: true, canCompose: true, canAccessAdmin: false, canRecharge: false, canManageUsers: false },
  agent: { canGenerate: true, canCompose: true, canAccessAdmin: false, canRecharge: false, canManageUsers: false },
  admin: { canGenerate: true, canCompose: true, canAccessAdmin: true, canRecharge: true, canManageUsers: true },
}

export class RoleConfigService {
  /** 列出全部角色配置（按 roleCode 升序） */
  async getAll() {
    const rows = await prisma.roleConfig.findMany({ orderBy: { roleCode: 'asc' } })
    return rows.map((r) => ({
      roleCode: r.roleCode,
      rate: r.rate,
      permissions: (r.permissions as RolePermission) ?? DEFAULT_PERMISSIONS[r.roleCode] ?? {},
    }))
  }

  /** 取单个角色配置，缺省回退默认值 */
  async get(roleCode: string): Promise<{ rate: number; permissions: RolePermission }> {
    const r = await prisma.roleConfig.findUnique({ where: { roleCode } })
    if (!r) {
      return { rate: DEFAULT_RATES[roleCode] ?? 1, permissions: DEFAULT_PERMISSIONS[roleCode] ?? {} }
    }
    return { rate: r.rate, permissions: (r.permissions as RolePermission) ?? DEFAULT_PERMISSIONS[roleCode] ?? {} }
  }

  /** 新建或更新角色配置；使用 Prisma 原生 upsert，省去一次 findUnique 往返（幂等） */
  async upsert(
    roleCode: string,
    data: { rate?: number; permissions?: RolePermission },
  ) {
    const rate = data.rate ?? DEFAULT_RATES[roleCode] ?? 1
    const permissions = (data.permissions as object) ?? DEFAULT_PERMISSIONS[roleCode] ?? {}
    return prisma.roleConfig.upsert({
      where: { roleCode },
      create: { roleCode, rate, permissions },
      update: { rate, permissions },
    })
  }

  /**
   * 取用户有效充值付款倍率：取其所有角色中最小倍率。
   * 例如用户同时是 user(1) 与 agent(0.7)，充值订单金额按 0.7 计算。
   * 注意：生成 / 合成 / 导出等积分消耗不使用该倍率，始终按积分规则标准扣减。
   */
  async getEffectiveRate(roleCodes: string[]): Promise<number> {
    if (!roleCodes.length) return 1
    const rows = await prisma.roleConfig.findMany({ where: { roleCode: { in: roleCodes } } })
    if (!rows.length) return 1
    const rates = rows.map((r) => r.rate).filter((rate) => Number.isFinite(rate) && rate > 0)
    return rates.length ? Math.min(...rates) : 1
  }

  /** 检查用户是否拥有某权限（任一角色具备即可） */
  async hasPermission(roleCodes: string[], permission: keyof RolePermission): Promise<boolean> {
    if (!roleCodes.length) return false
    const rows = await prisma.roleConfig.findMany({ where: { roleCode: { in: roleCodes } } })
    return rows.some((r) => {
      const p = (r.permissions as RolePermission) ?? DEFAULT_PERMISSIONS[r.roleCode] ?? {}
      return p[permission] === true
    })
  }
}

export const roleConfigService = new RoleConfigService()
