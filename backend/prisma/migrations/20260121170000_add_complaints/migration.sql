-- Create complaints table for employee complaints workflow

CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  store_id TEXT NULL,
  employee_id TEXT NULL,
  store_name TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  image TEXT NULL,
  status TEXT NOT NULL DEFAULT 'Chờ xử lý',
  admin_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  CONSTRAINT complaints_status_chk CHECK (status IN ('Chờ xử lý', 'Đang xử lý', 'Đã giải quyết', 'Từ chối'))
);

-- If the table existed from a failed attempt with integer columns, convert them to TEXT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'complaints'
      AND column_name = 'store_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE complaints ALTER COLUMN store_id TYPE TEXT USING store_id::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'complaints'
      AND column_name = 'employee_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE complaints ALTER COLUMN employee_id TYPE TEXT USING employee_id::text;
  END IF;

  -- Drop leftover FK constraints if they somehow exist.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_store_id_fkey') THEN
    ALTER TABLE complaints DROP CONSTRAINT complaints_store_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'complaints_employee_id_fkey') THEN
    ALTER TABLE complaints DROP CONSTRAINT complaints_employee_id_fkey;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_complaints_code ON complaints(code);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at);
CREATE INDEX IF NOT EXISTS idx_complaints_employee_id ON complaints(employee_id);
CREATE INDEX IF NOT EXISTS idx_complaints_store_id ON complaints(store_id);
