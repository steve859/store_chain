-- Create loyalty_customers table
CREATE TABLE "loyalty_customers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_id" INTEGER NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "phone" TEXT,
  "first_name" TEXT,
  "last_name" TEXT,
  "tier" TEXT NOT NULL DEFAULT 'bronze',
  "points_balance" BIGINT NOT NULL DEFAULT 0,
  "lifetime_spend" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "lifetime_points_earned" BIGINT NOT NULL DEFAULT 0,
  "lifetime_points_redeemed" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_purchase_at" TIMESTAMPTZ,
  FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE
);

-- Create indexes for loyalty_customers
CREATE UNIQUE INDEX "idx_loyalty_customers_store_email" ON "loyalty_customers"("store_id", "email");
CREATE INDEX "idx_loyalty_customers_store" ON "loyalty_customers"("store_id");
CREATE INDEX "idx_loyalty_customers_email" ON "loyalty_customers"("email");
CREATE INDEX "idx_loyalty_customers_tier" ON "loyalty_customers"("tier");

-- Create loyalty_transactions table
CREATE TABLE "loyalty_transactions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "loyalty_customer_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "points_amount" BIGINT NOT NULL,
  "reference_type" TEXT,
  "reference_id" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("loyalty_customer_id") REFERENCES "loyalty_customers" ("id") ON DELETE CASCADE
);

-- Create indexes for loyalty_transactions
CREATE INDEX "idx_loyalty_transactions_customer" ON "loyalty_transactions"("loyalty_customer_id");
CREATE INDEX "idx_loyalty_transactions_created" ON "loyalty_transactions"("created_at");
CREATE INDEX "idx_loyalty_transactions_reference" ON "loyalty_transactions"("reference_id");

-- Create loyalty_redemptions table
CREATE TABLE "loyalty_redemptions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "loyalty_customer_id" TEXT NOT NULL,
  "reward_id" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "value" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemed_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  FOREIGN KEY ("loyalty_customer_id") REFERENCES "loyalty_customers" ("id") ON DELETE CASCADE
);

-- Create indexes for loyalty_redemptions
CREATE INDEX "idx_loyalty_redemptions_customer" ON "loyalty_redemptions"("loyalty_customer_id");
CREATE INDEX "idx_loyalty_redemptions_status" ON "loyalty_redemptions"("status");
CREATE INDEX "idx_loyalty_redemptions_expires" ON "loyalty_redemptions"("expires_at");

-- Create loyalty_offers table
CREATE TABLE "loyalty_offers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "loyalty_customer_id" TEXT,
  "store_id" INTEGER,
  "offer_type" TEXT NOT NULL,
  "category" TEXT,
  "discount_percent" DECIMAL(5,2),
  "bonus_multiplier" INTEGER NOT NULL DEFAULT 1,
  "min_purchase" DECIMAL(12,2),
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "is_used" BOOLEAN NOT NULL DEFAULT false
);

-- Create indexes for loyalty_offers
CREATE INDEX "idx_loyalty_offers_customer" ON "loyalty_offers"("loyalty_customer_id");
CREATE INDEX "idx_loyalty_offers_store" ON "loyalty_offers"("store_id");
CREATE INDEX "idx_loyalty_offers_expires" ON "loyalty_offers"("expires_at");
