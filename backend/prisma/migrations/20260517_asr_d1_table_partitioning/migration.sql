-- ASR-D1: High-volume Transaction Storage
-- PostgreSQL Native Table Partitioning (RANGE by created_at, monthly)
--
-- Tables partitioned:
--   1. invoices           – core transaction table
--   2. invoice_items      – line items (inherits partition key via invoice_id)
--   3. stock_movements    – inventory change log
--   4. audit_logs         – system audit trail
--   5. loyalty_transactions – loyalty point history
--
-- Strategy: RANGE partitioning on created_at (monthly).
-- Prisma continues to query the parent table transparently; PostgreSQL
-- routes reads/writes to the correct child partition automatically.
--
-- IMPORTANT: Run this migration ONLY on a maintenance window.
--            It restructures tables in-place.

-- =====================================================================
-- Helper: Function to auto-create monthly partitions
-- =====================================================================
CREATE OR REPLACE FUNCTION create_monthly_partition(
    parent_table TEXT,
    partition_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := DATE_TRUNC('month', partition_date);
    end_date   := start_date + INTERVAL '1 month';
    partition_name := parent_table || '_y' || TO_CHAR(start_date, 'YYYY') || '_m' || TO_CHAR(start_date, 'MM');

    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
            partition_name, parent_table, start_date, end_date
        );
        RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 1. INVOICES  (id INT, created_at TIMESTAMPTZ)
-- =====================================================================
-- Step 1a: Rename old table
ALTER TABLE invoices RENAME TO invoices_old;

-- Step 1b: Create partitioned parent
CREATE TABLE invoices (
    id             SERIAL,
    invoice_number TEXT UNIQUE,
    store_id       INT,
    customer_id    INT,
    subtotal       NUMERIC(18,2) DEFAULT 0,
    tax            NUMERIC(14,2) DEFAULT 0,
    discount       NUMERIC(14,2) DEFAULT 0,
    total          NUMERIC(18,2) DEFAULT 0 NOT NULL,
    payment_method TEXT,
    created_by     INT,
    created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 1c: Create partitions for recent + future months
SELECT create_monthly_partition('invoices', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('invoices', CURRENT_DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE + INTERVAL '2 months')::DATE);

-- Step 1d: Create default partition for any out-of-range data
CREATE TABLE invoices_default PARTITION OF invoices DEFAULT;

-- Step 1e: Migrate existing data
INSERT INTO invoices SELECT * FROM invoices_old;

-- Step 1f: Re-create indexes on parent (auto-propagates to partitions)
CREATE INDEX idx_invoices_created_at_part ON invoices (created_at);
CREATE INDEX idx_invoices_store_part ON invoices (store_id);
CREATE INDEX idx_invoices_store_created_at_part ON invoices (store_id, created_at);

-- Step 1g: Re-create foreign keys
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;

-- Step 1h: Drop old table
DROP TABLE invoices_old CASCADE;


-- =====================================================================
-- 2. STOCK_MOVEMENTS  (id BIGINT, created_at TIMESTAMPTZ)
-- =====================================================================
ALTER TABLE stock_movements RENAME TO stock_movements_old;

CREATE TABLE stock_movements (
    id            BIGSERIAL,
    store_id      INT,
    variant_id    INT,
    change        NUMERIC NOT NULL,
    movement_type TEXT NOT NULL,
    reference_id  TEXT,
    reason        TEXT,
    created_by    INT,
    created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

SELECT create_monthly_partition('stock_movements', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('stock_movements', CURRENT_DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE stock_movements_default PARTITION OF stock_movements DEFAULT;

INSERT INTO stock_movements SELECT * FROM stock_movements_old;

CREATE INDEX idx_stock_movements_store_time_part ON stock_movements (store_id, created_at);
CREATE INDEX idx_stock_movements_variant_part ON stock_movements (variant_id);

ALTER TABLE stock_movements ADD CONSTRAINT fk_sm_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD CONSTRAINT fk_sm_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD CONSTRAINT fk_sm_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

DROP TABLE stock_movements_old CASCADE;


-- =====================================================================
-- 3. AUDIT_LOGS  (id BIGINT, created_at TIMESTAMPTZ)
-- =====================================================================
ALTER TABLE audit_logs RENAME TO audit_logs_old;

CREATE TABLE audit_logs (
    id          BIGSERIAL,
    user_id     INT,
    action      TEXT NOT NULL,
    object_type TEXT,
    object_id   TEXT,
    payload     JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

SELECT create_monthly_partition('audit_logs', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('audit_logs', CURRENT_DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

INSERT INTO audit_logs SELECT * FROM audit_logs_old;

CREATE INDEX idx_audit_logs_user_part ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at_part ON audit_logs (created_at);

ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

DROP TABLE audit_logs_old CASCADE;


-- =====================================================================
-- 4. LOYALTY_TRANSACTIONS  (id TEXT/CUID, created_at TIMESTAMPTZ)
-- =====================================================================
ALTER TABLE loyalty_transactions RENAME TO loyalty_transactions_old;

CREATE TABLE loyalty_transactions (
    id                  TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    loyalty_customer_id TEXT NOT NULL,
    type                TEXT NOT NULL,
    points_amount       BIGINT NOT NULL,
    reference_type      TEXT,
    reference_id        TEXT,
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('loyalty_transactions', CURRENT_DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE loyalty_transactions_default PARTITION OF loyalty_transactions DEFAULT;

INSERT INTO loyalty_transactions SELECT * FROM loyalty_transactions_old;

CREATE INDEX idx_lt_customer_part ON loyalty_transactions (loyalty_customer_id);
CREATE INDEX idx_lt_created_at_part ON loyalty_transactions (created_at);
CREATE INDEX idx_lt_reference_part ON loyalty_transactions (reference_id);

ALTER TABLE loyalty_transactions ADD CONSTRAINT fk_lt_customer
    FOREIGN KEY (loyalty_customer_id) REFERENCES loyalty_customers(id) ON DELETE CASCADE;

DROP TABLE loyalty_transactions_old CASCADE;
