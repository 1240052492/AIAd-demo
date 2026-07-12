import { z } from 'zod'

/** 注册：手机号或邮箱至少其一，密码 >= 6 位 */
export const registerSchema = z
  .object({
    phone: z
      .string()
      .regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
      .optional(),
    email: z.string().email('邮箱格式不正确').optional(),
    password: z.string().min(6, '密码至少 6 位'),
    nickname: z.string().max(20, '昵称最多 20 个字符').optional(),
  })
  .refine((data) => data.phone || data.email, {
    message: '手机号或邮箱至少填一个',
    path: ['phone'],
  })

/** 登录：手机号/邮箱 + 密码 */
export const loginSchema = z
  .object({
    phone: z.string().optional(),
    email: z.string().email('邮箱格式不正确').optional(),
    password: z.string().min(1, '请填写密码'),
  })
  .refine((data) => data.phone || data.email, {
    message: '请填写手机号或邮箱',
    path: ['phone'],
  })

/** 管理员调整积分：amount 正数增加 / 负数扣除 */
export const adjustCreditsSchema = z.object({
  amount: z.number().int('积分必须为整数'),
  reason: z.string().min(1, '请填写调整原因').max(200, '原因最多 200 个字符'),
})

/** 分页通用参数 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/** 管理员用户列表查询参数 */
export const adminUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().optional(),
  status: z.enum(['active', 'disabled', 'banned']).optional(),
})
