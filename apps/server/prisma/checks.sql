-- ============================================================================
-- 积分账户非负约束（F1 防御性兜底）
-- ----------------------------------------------------------------------------
-- 应用层已在 credit.service.ts 用「行锁 + 条件更新」保证 freeze/consume/refund
-- 不会让余额变负；本文件在数据库层再加一道 CHECK 约束，防止任何绕过应用层的
-- 直接写库（手动 SQL / 未来 bug）把 balance / frozen_balance 写成负数。
--
-- 运行方式（任选其一）：
--   1) psql 直连：          psql "$DATABASE_URL" -f prisma/checks.sql
--   2) 管道执行：           cat prisma/checks.sql | psql "$DATABASE_URL"
--   3) 走 Prisma 迁移：     将本文件内容并入你的下一次 migration.sql 后执行
--      `prisma migrate dev --create-only` 生成空迁移，把下面两句粘进去再 deploy。
--
-- 幂等：已存在约束则跳过（NOT VALID 仅为可重复执行，约束仍是 VALID 的）。
-- ============================================================================

-- 可用余额 >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_accounts_balance_nonneg'
  ) THEN
    ALTER TABLE "credit_accounts"
      ADD CONSTRAINT "credit_accounts_balance_nonneg"
      CHECK ("balance" >= 0);
  END IF;
END $$;

-- 冻结余额 >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_accounts_frozen_nonneg'
  ) THEN
    ALTER TABLE "credit_accounts"
      ADD CONSTRAINT "credit_accounts_frozen_nonneg"
      CHECK ("frozen_balance" >= 0);
  END IF;
END $$;
