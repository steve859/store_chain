-- ASR-R3: Add version column to inventories for Optimistic Locking
-- Default value = 1 for existing rows

ALTER TABLE inventories ADD COLUMN version INT NOT NULL DEFAULT 1;
