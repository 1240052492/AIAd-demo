import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { env } from '../src/config'

const prisma = new PrismaClient()

// 分类 -> businessType 映射
const BUSINESS_TYPE_MAP: Record<string, string> = {
  门头招牌: 'storefront_sign',
  文化墙: 'culture_wall',
  LOGO: 'brand_vi',
  海报: 'ad_material',
  餐饮海报: 'ad_material',
  美陈: 'meichen',
  标识牌: 'signage',
  品牌物料: 'brand_vi',
  图形设计: 'graphic_design',
  展板: 'exhibition_board',
  节日海报: 'ad_material',
}

// 代表性模板（含真实风格描述，覆盖主要业务类别，>=10 个）
const SEED_TEMPLATES: Array<{
  title: string
  category: string
  prompt: string
  sortOrder: number
}> = [
  {
    title: '面包店门头',
    category: '门头招牌',
    prompt:
      '暖色调面包店门头招牌，原木材质搭配暖色灯箱，品牌名醒目居中，左右展示主打产品，温馨有食欲，正面展示视角',
    sortOrder: 1,
  },
  {
    title: '奶茶店门头设计',
    category: '门头招牌',
    prompt:
      '清新风格奶茶店门头设计，马卡龙色系，发光字招牌，玻璃幕墙搭配绿植，年轻化时尚感，正面视角',
    sortOrder: 2,
  },
  {
    title: '餐饮门头',
    category: '门头招牌',
    prompt:
      '中式餐饮门店门头，红色与木质结合，醒目店招与霓虹灯点缀，突出菜系特色，临街正面视角',
    sortOrder: 3,
  },
  {
    title: '小学科技文化墙',
    category: '文化墙',
    prompt:
      '小学科技文化墙，搭配小型电子展示柜，造型避开市面常规款式；板块高低错落排布，落地基座、悬空挂墙两种造型穿插搭配，清新校园科技风，层次立体',
    sortOrder: 4,
  },
  {
    title: '中学校园文化墙',
    category: '文化墙',
    prompt:
      '中学校园文化墙，励志主题，板块错落排布，书香与科技元素结合，蓝白主色，正面展示视角',
    sortOrder: 5,
  },
  {
    title: 'logo“辣翻天串串香”',
    category: 'LOGO',
    prompt:
      '餐饮品牌 LOGO 设计，名称“辣翻天串串香”，红辣椒与火焰元素，热情奔放，扁平化风格，适合门头与包装',
    sortOrder: 6,
  },
  {
    title: '高端科技感 logo',
    category: 'LOGO',
    prompt:
      '高端科技感 LOGO，几何线条构成，蓝紫渐变，简约现代，适合 AI / 互联网品牌，矢量风格',
    sortOrder: 7,
  },
  {
    title: '成都城市宣传海报',
    category: '海报',
    prompt:
      '成都城市宣传海报，熊猫、火锅、宽窄巷子元素，国潮插画风，明快配色，竖版构图',
    sortOrder: 8,
  },
  {
    title: '重庆江湖菜海报',
    category: '海报',
    prompt:
      '重庆江湖菜美食海报，辣椒与热油飞溅特写，烟火气十足，红黑强对比，食欲感强',
    sortOrder: 9,
  },
  {
    title: '陕西凉皮海报',
    category: '餐饮海报',
    prompt:
      '陕西凉皮餐饮海报，爽滑凉皮特写，红油辣子点缀，清爽与麻辣对比，暖色美食摄影风',
    sortOrder: 10,
  },
  {
    title: '中秋美陈',
    category: '美陈',
    prompt:
      '商场中秋美陈装置，月亮与玉兔主题，暖金灯光，圆月中庭吊装，节日氛围浓厚，空间透视',
    sortOrder: 11,
  },
  {
    title: '面包店全套 VI 物料',
    category: '品牌物料',
    prompt:
      '面包店全套 VI 物料设计，含 logo、包装袋、封口贴、会员卡、围裙，统一暖色调，原木与奶油色系',
    sortOrder: 12,
  },
  {
    title: '海鲜品牌辅助图形',
    category: '图形设计',
    prompt:
      '海鲜品牌辅助图形，鱼形波浪纹样，蓝白配色，简约几何，适合包装与背景纹理',
    sortOrder: 13,
  },
  {
    title: '校园安全展板',
    category: '展板',
    prompt:
      '校园安全宣传展板，分板块排版，卡通插画风格，红黄警示色，内容清晰易读，横版',
    sortOrder: 14,
  },
  {
    title: '竖版中秋节日海报',
    category: '节日海报',
    prompt:
      '竖版中秋节日海报，满月与桂花、玉兔元素，国风插画，暖金色调，留白诗意',
    sortOrder: 15,
  },
]

// 默认 6 步广告工作流
const DEFAULT_WORKFLOW_STEPS = [
  {
    role: 'strategy',
    name: '需求简报分析',
    systemPrompt: '分析用户提供的项目简报，提炼核心诉求、目标人群与风格关键词。',
    requireConfirm: true,
    creditCost: 0,
  },
  {
    role: 'copywriter',
    name: '生成提示词',
    systemPrompt: '根据简报生成面向生图模型的高质量中文提示词，包含主体、风格、构图、材质。',
    requireConfirm: true,
    creditCost: 1,
  },
  {
    role: 'creative-director',
    name: '风格设定',
    systemPrompt: '确定色彩方案、版式与视觉调性，输出风格指南。',
    requireConfirm: false,
    creditCost: 0,
  },
  {
    role: 'designer',
    name: 'AI 生图',
    systemPrompt: '调用生图模型生成主视觉图，按批次产出多版方案。',
    requireConfirm: false,
    creditCost: 2,
  },
  {
    role: 'designer',
    name: '合成排版',
    systemPrompt: '将主视觉与文案合成为成品版面，输出预览图。',
    requireConfirm: false,
    creditCost: 1,
  },
  {
    role: 'designer',
    name: '导出交付',
    systemPrompt: '按需求导出 PNG / SVG / PDF 交付文件。',
    requireConfirm: false,
    creditCost: 1,
  },
]

async function main() {
  console.log('🌱 开始播种数据...')

  // 1. 创建角色
  for (const code of ['admin', 'user', 'guest']) {
    const nameMap: Record<string, string> = { admin: '管理员', user: '普通用户', guest: '访客' }
    await prisma.role.upsert({
      where: { code },
      update: {},
      create: { code, name: nameMap[code] },
    })
  }
  console.log('✓ 角色已就绪')

  // 2. 创建管理员
  const adminRole = await prisma.role.findUnique({ where: { code: 'admin' } })
  const userRole = await prisma.role.findUnique({ where: { code: 'user' } })
  const hashedPassword = await bcrypt.hash('Admin123456', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@adcraft.ai' },
    update: {},
    create: {
      email: 'admin@adcraft.ai',
      nickname: '系统管理员',
      passwordHash: hashedPassword,
      status: 'active',
      roles: { create: [{ roleId: adminRole!.id }] },
      creditAccount: {
        create: { balance: 9999, frozenBalance: 0 },
      },
    },
  })
  // 确保管理员积分账户与角色存在（upsert 不覆盖关联，需补建）
  await prisma.creditAccount.upsert({
    where: { userId: admin.id },
    update: { balance: 9999 },
    create: { userId: admin.id, balance: 9999 },
  })
  const adminHasRole = await prisma.userRole.findFirst({
    where: { userId: admin.id, roleId: adminRole!.id },
  })
  if (!adminHasRole) {
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole!.id } })
  }
  // 管理员初始积分流水
  const adminTx = await prisma.creditTransaction.findFirst({
    where: { userId: admin.id, type: 'admin_adjust', reason: '管理员初始额度' },
  })
  if (!adminTx) {
    await prisma.creditTransaction.create({
      data: {
        userId: admin.id,
        accountId: (await prisma.creditAccount.findUnique({ where: { userId: admin.id } }))!.id,
        type: 'admin_adjust',
        amount: 9999,
        balanceAfter: 9999,
        reason: '管理员初始额度',
      },
    })
  }
  console.log('✓ 管理员已就绪 (admin@adcraft.ai / Admin123456)')

  // 2.1 创建示例普通用户（用于演示）
  const demo = await prisma.user.upsert({
    where: { email: 'demo@adcraft.ai' },
    update: {},
    create: {
      email: 'demo@adcraft.ai',
      nickname: '演示用户',
      passwordHash: await bcrypt.hash('Demo123456', 10),
      status: 'active',
      roles: { create: [{ roleId: userRole!.id }] },
      creditAccount: { create: { balance: env.registerBonusCredits, frozenBalance: 0 } },
    },
  })
  await prisma.creditAccount.upsert({
    where: { userId: demo.id },
    update: {},
    create: { userId: demo.id, balance: env.registerBonusCredits },
  })
  const demoTx = await prisma.creditTransaction.findFirst({
    where: { userId: demo.id, type: 'register_bonus' },
  })
  if (!demoTx) {
    await prisma.creditTransaction.create({
      data: {
        userId: demo.id,
        accountId: (await prisma.creditAccount.findUnique({ where: { userId: demo.id } }))!.id,
        type: 'register_bonus',
        amount: env.registerBonusCredits,
        balanceAfter: env.registerBonusCredits,
        reason: '注册赠送',
      },
    })
  }
  console.log('✓ 演示用户已就绪 (demo@adcraft.ai / Demo123456)')

  // 4. 创建示例模板（去重按 title + category）
  let templateCount = 0
  for (const t of SEED_TEMPLATES) {
    const existed = await prisma.template.findFirst({
      where: { title: t.title, category: t.category },
      select: { id: true },
    })
    if (existed) continue
    await prisma.template.create({
      data: {
        title: t.title,
        category: t.category,
        businessType: BUSINESS_TYPE_MAP[t.category] || 'ad_material',
        prompt: t.prompt,
        isPublic: true,
        sortOrder: t.sortOrder,
      },
    })
    templateCount++
  }
  console.log(`✓ 模板播种完成（新增 ${templateCount} 个）`)

  // 5. 创建工作流模板（默认 6 步广告工作流）
  const wfExisted = await prisma.workflowTemplate.findFirst({
    where: { title: '标准广告设计工作流' },
    select: { id: true },
  })
  if (!wfExisted) {
    await prisma.workflowTemplate.create({
      data: {
        title: '标准广告设计工作流',
        businessType: 'ad_material',
        description: '从需求简报到交付的标准 6 步广告设计流程',
        stepsJson: DEFAULT_WORKFLOW_STEPS as any,
        isPublic: true,
      },
    })
  }
  console.log('✓ 工作流模板已就绪')

  // 6. 创建 AI Provider 默认配置
  const providers = [
    {
      provider: 'anthropic',
      displayName: 'Anthropic Claude',
      baseUrl: env.anthropicBaseUrl,
      model: env.anthropicModel,
      enabled: true,
      priority: 10,
    },
    {
      provider: 'openai_image',
      displayName: 'OpenAI GPT-image',
      baseUrl: env.openaiImageBaseUrl,
      model: env.openaiImageModel,
      enabled: true,
      priority: 20,
    },
    {
      provider: 'banana2',
      displayName: 'Banana2',
      baseUrl: process.env.BANANA2_BASE_URL || '',
      model: process.env.BANANA2_MODEL || '',
      enabled: process.env.BANANA2_ENABLED === 'true',
      priority: 30,
    },
  ]
  for (const p of providers) {
    const existed = await prisma.aiProviderConfig.findFirst({ where: { provider: p.provider } })
    if (!existed) {
      await prisma.aiProviderConfig.create({ data: p as any })
    }
  }
  console.log('✓ AI Provider 配置已就绪')

  console.log('✅ 播种完成!')
  // 强制退出，避免 config 中 BullMQ 队列连接使进程挂起
  await prisma.$disconnect()
  process.exit(0)
}

main()
  .catch((e) => {
    console.error('❌ 播种失败:', e)
    prisma.$disconnect().finally(() => process.exit(1))
  })
