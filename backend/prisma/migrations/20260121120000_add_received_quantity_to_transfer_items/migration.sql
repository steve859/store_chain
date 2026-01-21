-- Add received_quantity to support partial receiving of store transfers

ALTER TABLE "store_transfer_items"
ADD COLUMN IF NOT EXISTS "received_quantity" DECIMAL NOT NULL DEFAULT 0;

-- Backfill safety (in case DEFAULT wasn't applied in some environments)
UPDATE "store_transfer_items" SET "received_quantity" = 0 WHERE "received_quantity" IS NULL;
