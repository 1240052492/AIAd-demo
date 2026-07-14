-- 加法迁移：会员/充值/角色权限配置（不改动任何已有表，避免 schema drift）
-- 对应 schema.prisma 新增模型：MembershipPlan / UserMembership / RechargeOrder / RoleConfig

-- ============ membership_plans ============
CREATE TABLE IF NOT EXISTS "membership_plans" (
  "id"            text    NOT NULL,
  "code"          text    NOT NULL,
  "name"          text    NOT NULL,
  "description"   text,
  "price"         integer NOT NULL DEFAULT 0,
  "points"        integer NOT NULL DEFAULT 0,
  "duration_days" integer,
  "rate"          double precision NOT NULL DEFAULT 1,
  "permissions"   jsonb,
  "is_active"     boolean NOT NULL DEFAULT true,
  "sort_order"    integer NOT NULL DEFAULT 0,
  "created_at"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "membership_plans_code_key" ON "membership_plans"("code");

-- ============ user_memberships ============
CREATE TABLE IF NOT EXISTS "user_memberships" (
  "id"             text    NOT NULL,
  "user_id"        text    NOT NULL,
  "plan_id"        text    NOT NULL,
  "status"         text    NOT NULL DEFAULT 'active',
  "points_granted" integer NOT NULL DEFAULT 0,
  "started_at"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"     timestamp(3),
  "created_at"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "user_memberships_user_id_idx" ON "user_memberships"("user_id");

-- ============ recharge_orders ============
CREATE TABLE IF NOT EXISTS "recharge_orders" (
  "id"         text    NOT NULL,
  "user_id"    text    NOT NULL,
  "order_no"   text    NOT NULL,
  "amount"     integer NOT NULL,
  "points"     integer NOT NULL,
  "rate"       double precision NOT NULL DEFAULT 1,
  "status"     text    NOT NULL DEFAULT 'pending',
  "pay_channel" text,
  "paid_at"    timestamp(3),
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recharge_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "recharge_orders_order_no_key" ON "recharge_orders"("order_no");
CREATE INDEX IF NOT EXISTS "recharge_orders_user_id_idx" ON "recharge_orders"("user_id");
CREATE INDEX IF NOT EXISTS "recharge_orders_status_idx" ON "recharge_orders"("status");

-- ============ role_configs ============
CREATE TABLE IF NOT EXISTS "role_configs" (
  "id"          text    NOT NULL,
  "role_code"   text    NOT NULL,
  "rate"        double precision NOT NULL DEFAULT 1,
  "permissions" jsonb,
  "updated_at"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_configs_role_code_key" ON "role_configs"("role_code");

-- ============ 幂等种子数据（ON CONFLICT DO NOTHING） ============

-- 角色倍率与权限包（服务端强制生效）
INSERT INTO "role_configs" ("id","role_code","rate","permissions","updated_at") VALUES
  ('rc_guest','guest',1,'{"canGenerate":false,"canCompose":false,"canAccessAdmin":false,"canRecharge":false,"canManageUsers":false,"canExport":false}',now()),
  ('rc_user','user',1,'{"canGenerate":true,"canCompose":true,"canAccessAdmin":false,"canRecharge":false,"canManageUsers":false}',now()),
  ('rc_agent','agent',0.7,'{"canGenerate":true,"canCompose":true,"canAccessAdmin":false,"canRecharge":false,"canManageUsers":false}',now()),
  ('rc_admin','admin',1,'{"canGenerate":true,"canCompose":true,"canAccessAdmin":true,"canRecharge":true,"canManageUsers":true}',now())
ON CONFLICT ("role_code") DO NOTHING;

-- 会员套餐（价格单位：分；points=赠送/包含积分；rate=消费倍率）
INSERT INTO "membership_plans"
  ("id","code","name","description","price","points","duration_days","rate","permissions","is_active","sort_order","created_at","updated_at") VALUES
  ('mp_monthly','monthly','月度会员','按月订阅，享全部生成与导出能力',2900,300,30,1,'{"canGenerate":true,"canCompose":true,"canExport":true,"canPriority":false}',true,1,now(),now()),
  ('mp_yearly','yearly','年度会员','按年订阅，额外赠送积分与优先额度',29000,4000,365,1,'{"canGenerate":true,"canCompose":true,"canExport":true,"canPriority":true}',true,2,now(),now()),
  ('mp_enterprise','enterprise','企业会员','企业团队账号，专属倍率与协作',99000,20000,365,0.9,'{"canGenerate":true,"canCompose":true,"canExport":true,"canPriority":true,"canTeam":true}',true,3,now(),now()),
  ('mp_points','points','购买积分','直接购买积分包，无时长限制',1000,100,NULL,1,NULL,true,4,now(),now())
ON CONFLICT ("code") DO NOTHING;
