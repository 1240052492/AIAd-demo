-- CreateIndex
CREATE INDEX "credit_transactions_userId_created_at_idx" ON "credit_transactions"("userId", "created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_userId_updated_at_idx" ON "projects"("userId", "updated_at" DESC);
