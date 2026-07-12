-- CreateTable
CREATE TABLE "users" (
    "id" text NOT NULL,
    "phone" text,
    "email" text,
    "nickname" text,
    "password_hash" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable
CREATE TABLE "roles" (
    "id" text NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" text NOT NULL,
    "roleId" text NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "credit_accounts" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "balance" integer NOT NULL DEFAULT 0,
    "frozen_balance" integer NOT NULL DEFAULT 0,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,

    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_accounts_userId_key" ON "credit_accounts"("userId");

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "accountId" text NOT NULL,
    "type" text NOT NULL,
    "amount" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "related_type" text,
    "related_id" text,
    "reason" text,
    "operator_id" text,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "title" text NOT NULL,
    "business_type" text NOT NULL,
    "status" text NOT NULL DEFAULT 'draft',
    "brief_json" jsonb,
    "current_version_id" text,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_versions" (
    "id" text NOT NULL,
    "projectId" text NOT NULL,
    "name" text NOT NULL,
    "canvas_json" jsonb,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" text NOT NULL,
    "userId" text,
    "projectId" text,
    "generation_job_id" text,
    "type" text NOT NULL,
    "storage_key" text NOT NULL,
    "url" text NOT NULL,
    "mime_type" text,
    "width" integer,
    "height" integer,
    "size" integer,
    "metadata_json" jsonb,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_generationJobId_idx" ON "assets"("generation_job_id");

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "projectId" text,
    "provider" text NOT NULL,
    "model" text NOT NULL,
    "job_type" text NOT NULL,
    "status" text NOT NULL DEFAULT 'queued',
    "prompt" text,
    "request_json" jsonb,
    "response_json" jsonb,
    "error_message" text,
    "credits_frozen" integer NOT NULL DEFAULT 0,
    "credits_consumed" integer NOT NULL DEFAULT 0,
    "started_at" timestamp(3),
    "finished_at" timestamp(3),
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_jobs_status_idx" ON "generation_jobs"("status");

-- CreateIndex
CREATE INDEX "generation_jobs_userId_idx" ON "generation_jobs"("userId");

-- CreateTable
CREATE TABLE "templates" (
    "id" text NOT NULL,
    "title" text NOT NULL,
    "category" text NOT NULL,
    "business_type" text NOT NULL,
    "cover_asset_id" text,
    "prompt" text NOT NULL,
    "config_json" jsonb,
    "sort_order" integer NOT NULL DEFAULT 0,
    "is_public" boolean NOT NULL DEFAULT true,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_category_idx" ON "templates"("category");

-- CreateIndex
CREATE INDEX "templates_businessType_idx" ON "templates"("business_type");

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" text NOT NULL,
    "title" text NOT NULL,
    "business_type" text NOT NULL,
    "description" text,
    "steps_json" jsonb NOT NULL,
    "credit_rule_json" jsonb,
    "is_public" boolean NOT NULL DEFAULT true,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" text NOT NULL,
    "provider" text NOT NULL,
    "display_name" text NOT NULL,
    "base_url" text NOT NULL,
    "model" text NOT NULL,
    "enabled" boolean NOT NULL DEFAULT true,
    "priority" integer NOT NULL DEFAULT 0,
    "config_json" jsonb,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" text NOT NULL,
    "key" text NOT NULL,
    "value" text NOT NULL,
    "updated_at" timestamp(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "credit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
