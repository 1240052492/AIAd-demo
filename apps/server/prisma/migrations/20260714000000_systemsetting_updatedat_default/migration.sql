-- ============================================================
-- 修复 system_settings 表迁移漂移（生产必须执行）
-- ============================================================
-- 问题：dev/生产库中 system_settings 实际存在两个 updatedAt 列：
--   1) "updatedAt"   —— 驼峰（NOT NULL，无默认值），由早期未加 @map 的 schema 产生，
--                            Prisma 永远只写 @map("updated_at") 指向的那一列，
--                            因此该驼峰列始终为 NULL，触发 P2011 NOT NULL 约束冲突。
--   2) "updated_at" —— 经 @map("updated_at") 映射的正确列。
-- 现象：所有对 system_settings 的写入（如 /api/admin/credit-rules PUT）均返回 500。
--
-- 修复：把表结构对齐到当前 schema（仅保留 updated_at 一列），并为其设置 now() 默认值作为兜底。
DO $$
BEGIN
  -- 情形 A：同时存在驼峰 updatedAt 与 snake updated_at → 删除驼峰列
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='updatedAt')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='updated_at') THEN
    ALTER TABLE "system_settings" DROP COLUMN "updatedAt";
  END IF;

  -- 情形 B：仅存在驼峰 updatedAt（无 snake updated_at）→ 改名对齐 schema
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='updatedAt')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='updated_at') THEN
    ALTER TABLE "system_settings" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;

  -- 确保映射列 updated_at 具备 now() 默认值（兜底，避免任何写入遗漏该列）
  ALTER TABLE "system_settings" ALTER COLUMN "updated_at" SET DEFAULT now();
END $$;

-- 同步 Prisma 客户端侧默认值声明（schema 已将 updatedAt 改为 @default(now())，
-- 与上面的 DB 级默认值一致）。后续部署请执行 `prisma migrate deploy`。
