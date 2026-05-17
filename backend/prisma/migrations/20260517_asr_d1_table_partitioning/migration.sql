-- ASR-D1: High-volume Transaction Storage
-- PostgreSQL Native Table Partitioning (RANGE by created_at, monthly)
--
-- Tables partitioned:
--   1. invoices              – core transaction table
--   2. stock_movements       – inventory change log
--   3. audit_logs            – system audit trail
--   4. loyalty_transactions  – loyalty point history
--
-- Strategy: RANGE partitioning on created_at (monthly).
-- Prisma queries the parent table transparently; PostgreSQL
-- routes reads/writes to the correct child partition automatically.
--
-- NOTE: Column definitions are aligned EXACTLY with the actual DB schema
-- to prevent INSERT SELECT type mismatches.

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
-- 1. INVOICES  (id INT serial, created_at TIMESTAMPTZ)
--    Columns from DB: id(int4), invoice_number(text), store_id(int4),
--    customer_id(int4), subtotal(numeric), tax(numeric), discount(numeric),
--    total(numeric), payment_method(text), created_by(int4), created_at(timestamptz)
-- =====================================================================
ALTER TABLE invoices RENAME TO invoices_old;

-- Drop FK constraints referencing invoices (invoice_items, returns)
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_invoice_id_fkey;

CREATE TABLE invoices (
    id             SERIAL,
    invoice_number TEXT,
    store_id       INT,
    customer_id    INT,
    subtotal       NUMERIC DEFAULT 0,
    tax            NUMERIC DEFAULT 0,
    discount       NUMERIC DEFAULT 0,
    total          NUMERIC DEFAULT 0 NOT NULL,
    payment_method TEXT,
    created_by     INT,
    created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id, created_at),
    UNIQUE (invoice_number, created_at)
) PARTITION BY RANGE (created_at);

SELECT create_monthly_partition('invoices', (CURRENT_DATE - INTERVAL '3 months')::DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('invoices', CURRENT_DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('invoices', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE invoices_default PARTITION OF invoices DEFAULT;

INSERT INTO invoices (id, invoice_number, store_id, customer_id, subtotal, tax, discount, total, payment_method, created_by, created_at)
SELECT id, invoice_number, store_id, customer_id, subtotal, tax, discount, total, payment_method, created_by, COALESCE(created_at, NOW())
FROM invoices_old;

-- Reset sequence
SELECT setval('invoices_id_seq', COALESCE((SELECT MAX(id) FROM invoices), 0) + 1);

CREATE INDEX idx_invoices_created_at_part ON invoices (created_at);
CREATE INDEX idx_invoices_store_part ON invoices (store_id);
CREATE INDEX idx_invoices_store_created_at_part ON invoices (store_id, created_at);

ALTER TABLE invoices ADD CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;

-- Re-add FK from invoice_items and returns pointing to partitioned invoices
-- NOTE: FK to partitioned table requires unique constraint that includes partition key.
-- invoice_items.invoice_id references invoices.id — but partitioned PK is (id, created_at).
-- PostgreSQL cannot enforce cross-partition FK, so we skip FK recreation and rely on app-level integrity.

DROP TABLE invoices_old CASCADE;


-- =====================================================================
-- 2. STOCK_MOVEMENTS  (id BIGINT serial, created_at TIMESTAMPTZ)
--    Columns: id(int8), store_id(int4), variant_id(int4), change(numeric),
--    movement_type(text), reference_id(text), reason(text), created_by(int4),
--    created_at(timestamptz)
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

SELECT create_monthly_partition('stock_movements', (CURRENT_DATE - INTERVAL '3 months')::DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('stock_movements', CURRENT_DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('stock_movements', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE stock_movements_default PARTITION OF stock_movements DEFAULT;

INSERT INTO stock_movements (id, store_id, variant_id, change, movement_type, reference_id, reason, created_by, created_at)
SELECT id, store_id, variant_id, change, movement_type, reference_id, reason, created_by, COALESCE(created_at, NOW())
FROM stock_movements_old;

SELECT setval('stock_movements_id_seq', COALESCE((SELECT MAX(id) FROM stock_movements), 0) + 1);

CREATE INDEX idx_stock_movements_store_time_part ON stock_movements (store_id, created_at);
CREATE INDEX idx_stock_movements_variant_part ON stock_movements (variant_id);

DROP TABLE stock_movements_old CASCADE;


-- =====================================================================
-- 3. AUDIT_LOGS  (id BIGINT serial, created_at TIMESTAMPTZ)
--    Columns: id(int8), user_id(int4), action(text), object_type(text),
--    object_id(text), payload(jsonb), created_at(timestamptz)
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

SELECT create_monthly_partition('audit_logs', (CURRENT_DATE - INTERVAL '3 months')::DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('audit_logs', CURRENT_DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('audit_logs', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

INSERT INTO audit_logs (id, user_id, action, object_type, object_id, payload, created_at)
SELECT id, user_id, action, object_type, object_id, payload, COALESCE(created_at, NOW())
FROM audit_logs_old;

SELECT setval('audit_logs_id_seq', COALESCE((SELECT MAX(id) FROM audit_logs), 0) + 1);

CREATE INDEX idx_audit_logs_user_part ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at_part ON audit_logs (created_at);

DROP TABLE audit_logs_old CASCADE;


-- =====================================================================
-- 4. LOYALTY_TRANSACTIONS  (id TEXT, created_at TIMESTAMPTZ)
--    Columns: id(text), loyalty_customer_id(text), type(text),
--    points_amount(int8), reference_type(text), reference_id(text),
--    description(text), created_at(timestamptz)
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

SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE - INTERVAL '3 months')::DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE - INTERVAL '2 months')::DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE - INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('loyalty_transactions', CURRENT_DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE + INTERVAL '1 month')::DATE);
SELECT create_monthly_partition('loyalty_transactions', (CURRENT_DATE + INTERVAL '2 months')::DATE);
CREATE TABLE loyalty_transactions_default PARTITION OF loyalty_transactions DEFAULT;

INSERT INTO loyalty_transactions (id, loyalty_customer_id, type, points_amount, reference_type, reference_id, description, created_at)
SELECT id, loyalty_customer_id, type, points_amount, reference_type, reference_id, description, COALESCE(created_at, NOW())
FROM loyalty_transactions_old;

CREATE INDEX idx_lt_customer_part ON loyalty_transactions (loyalty_customer_id);
CREATE INDEX idx_lt_created_at_part ON loyalty_transactions (created_at);
CREATE INDEX idx_lt_reference_part ON loyalty_transactions (reference_id);

DROP TABLE loyalty_transactions_old CASCADE;
