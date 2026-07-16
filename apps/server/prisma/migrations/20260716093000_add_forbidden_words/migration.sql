CREATE TABLE "forbidden_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "match_type" TEXT NOT NULL DEFAULT 'contains',
    "action" TEXT NOT NULL DEFAULT 'block',
    "replacement" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "forbidden_words_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "forbidden_words_word_key" ON "forbidden_words"("word");
CREATE INDEX "forbidden_words_enabled_idx" ON "forbidden_words"("enabled");
CREATE INDEX "forbidden_words_category_idx" ON "forbidden_words"("category");
