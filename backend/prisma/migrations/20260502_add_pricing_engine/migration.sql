-- Phase 2.2: Dynamic Pricing Engine Tables

-- Create pricing_rules table
CREATE TABLE "pricing_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_id" INTEGER NOT NULL,
  "product_variant_id" INTEGER,
  "category_id" INTEGER,
  "rule_name" TEXT NOT NULL,
  "rule_type" TEXT NOT NULL,
  "base_price" DECIMAL(14,2) NOT NULL,
  "min_price" DECIMAL(14,2),
  "max_price" DECIMAL(14,2),
  "adjustment_value" DECIMAL(5,2),
  "adjustment_type" TEXT,
  "condition_type" TEXT,
  "condition_value" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" TIMESTAMPTZ NOT NULL,
  "effective_until" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "idx_pricing_rules_unique" ON "pricing_rules"("store_id", "product_variant_id", "category_id", "rule_type");
CREATE INDEX "idx_pricing_rules_store" ON "pricing_rules"("store_id");
CREATE INDEX "idx_pricing_rules_active" ON "pricing_rules"("is_active");

-- Create pricing_history table
CREATE TABLE "pricing_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pricing_rule_id" TEXT NOT NULL,
  "product_variant_id" INTEGER,
  "store_id" INTEGER NOT NULL,
  "old_price" DECIMAL(14,2) NOT NULL,
  "new_price" DECIMAL(14,2) NOT NULL,
  "price_change_percent" DECIMAL(5,2),
  "reason" TEXT NOT NULL,
  "triggered_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE
);

CREATE INDEX "idx_pricing_history_rule" ON "pricing_history"("pricing_rule_id");
CREATE INDEX "idx_pricing_history_store" ON "pricing_history"("store_id");
CREATE INDEX "idx_pricing_history_created" ON "pricing_history"("created_at");

-- Create demand_metrics table
CREATE TABLE "demand_metrics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_id" INTEGER NOT NULL,
  "product_variant_id" INTEGER,
  "category_id" INTEGER,
  "day_of_week" INTEGER NOT NULL,
  "hour_of_day" INTEGER,
  "demand_level" INTEGER NOT NULL,
  "sales_count_24h" INTEGER NOT NULL DEFAULT 0,
  "sales_count_7d" INTEGER NOT NULL DEFAULT 0,
  "inventory_level" DECIMAL(14,2) NOT NULL,
  "inventory_turnover" DECIMAL(5,2),
  "price_elasticity" DECIMAL(3,2),
  "last_calculated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants" ("id") ON DELETE SET NULL,
  FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "idx_demand_metrics_unique" ON "demand_metrics"("store_id", "product_variant_id", "category_id", "day_of_week", "hour_of_day");
CREATE INDEX "idx_demand_metrics_store" ON "demand_metrics"("store_id");
CREATE INDEX "idx_demand_metrics_level" ON "demand_metrics"("demand_level");

-- Create competitor_prices table
CREATE TABLE "competitor_prices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_id" INTEGER NOT NULL,
  "product_sku" TEXT NOT NULL,
  "competitor_name" TEXT NOT NULL,
  "competitor_price" DECIMAL(14,2) NOT NULL,
  "our_price" DECIMAL(14,2) NOT NULL,
  "price_difference" DECIMAL(14,2) NOT NULL,
  "price_diff_percent" DECIMAL(5,2),
  "is_competitive" BOOLEAN NOT NULL DEFAULT false,
  "scraped_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE CASCADE
);

CREATE INDEX "idx_competitor_prices_store" ON "competitor_prices"("store_id");
CREATE INDEX "idx_competitor_prices_sku" ON "competitor_prices"("product_sku");
