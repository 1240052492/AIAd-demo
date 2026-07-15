# 客户反馈 Round2 前端修复

## 反馈项 → 文件
1. 生图失败展示+重试：Home/index.tsx, stores/generation.ts（errorMessage / retryLast）
2. 管理员 F5 跳登录：stores/index.ts restoreSession 全程 raw fetch，避免 401 误跳
3. 首页-项目-画布：Home 打开项目/画布 + 关联提示
4. 系统管理入口唯一：MainLayout 仅一处 isAdmin 入口
5. 返回工作台后会话：独立 admin 壳 + restore 修复
6. 支付宝充值：Membership/index.tsx 调用 POST /credits/recharge，展示错误/待支付，不假到账
7. 会员套餐：Membership 月度/年度/企业排序展示 + 卡片权益
8. 积分详情/规则/流水：PointsDetail 中文规则名、类型筛选、余额冻结收支
9. Provider CRUD：admin-config.api + Admin/Providers 增删改查
10. 工作流 stepsJson/creditRuleJson：Admin/Workflow 步骤编辑
11. 任务队列 pause/refund/retry/get detail：Admin/TaskQueue + API
12. 工作流 8000 字限制：Workflows/index.tsx 计数与禁用

## 仍需外部配置
- 支付宝密钥与支付回调
- 文本/图像 Provider 环境变量 API Key
- 管理员 refresh cookie 在跨端口/代理下需同源代理正确
