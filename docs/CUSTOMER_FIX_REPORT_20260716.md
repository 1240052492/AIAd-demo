# 客户反馈前端修复报告

## 修改文件
- apps/web/src/App.tsx — 后台独立路由 `/admin/:tab`，脱离 MainLayout
- apps/web/src/pages/Admin/index.tsx — URL 页签持久化；导航文案；积分流水/API 配置入口
- apps/web/src/pages/Admin/CreditLedger.tsx — 管理员积分流水面板（对接 `/admin/credit-transactions`）
- apps/web/src/services/admin-config.api.ts — getCreditTransactions
- apps/web/src/components/layout/MainLayout.tsx — 系统管理单一入口
- apps/web/src/pages/Login/index.tsx — 管理员登录 → `/admin/overview`
- apps/web/src/stores/generation.ts — lastGenerateConfig / retryLast / 失败 errorMessage
- apps/web/src/pages/Home/index.tsx — 失败态+重试；打开项目/画布；关联项目提示
- apps/web/src/pages/Membership/index.tsx — 充值明确「支付接口待接入」
- apps/web/src/pages/Membership/PointsDetail.tsx — 余额/冻结/收支/类型筛选/规则中文
- apps/web/src/pages/Admin/MembershipMgmt.tsx — 套餐卡片化
- apps/web/src/pages/Admin/RechargeMgmt.tsx / Providers.tsx / CreditRules.tsx — 文案可读
- apps/server/src/routes/admin.ts + admin.service.ts — 已有全量 credit-transactions API（worktree 内）

## 客户项对应
1. 失败态：画布展示失败原因 +「使用相同参数重试」
2. 后台 tab：`/admin/:tab` 刷新保持
3. 首页项目/画布：打开项目、打开画布、关联条
4. 系统管理：工作台仅一处入口；后台仅「返回工作台」
5. 后台独立壳；普通用户无系统管理；刷新停留当前路径
6. 充值：金额/积分展示 + 支付待接入，disabled 不到账
7. 会员套餐卡片：价格/积分/有效期/状态/操作
8. 用户积分详情+筛选；后台「积分流水」
9. 导航「API 配置 / 模型服务」→ Providers，密钥不展示
10. 后台无用户端 rail/画布导航

## 仍需后端配合
- 在线支付 / 会员购买真正到账
- 高清生图 Provider Key
- 全局流水 API 已在 worktree 存在；若部署环境无此路由需同步后端
