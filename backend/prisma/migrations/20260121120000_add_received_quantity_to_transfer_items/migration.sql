-- Add received_quantity to support partial receiving of store transfers

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.tables
		WHERE table_schema = 'public'
			AND table_name = 'store_transfer_items'
	) THEN
		ALTER TABLE "store_transfer_items"
		ADD COLUMN IF NOT EXISTS "received_quantity" DECIMAL NOT NULL DEFAULT 0;

		-- Backfill safety (in case DEFAULT wasn't applied in some environments)
		UPDATE "store_transfer_items" SET "received_quantity" = 0 WHERE "received_quantity" IS NULL;
	END IF;
END $$;
