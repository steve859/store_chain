-- Add persisted fields for promotions

ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "store_codes" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "promotions"
  ADD COLUMN IF NOT EXISTS "usage_count" INTEGER NOT NULL DEFAULT 0;
