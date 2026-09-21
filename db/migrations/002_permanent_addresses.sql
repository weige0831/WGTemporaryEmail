-- 002: permanent (long-term) mailboxes
-- Adds address_type and makes expires_at nullable for permanent addresses.
-- Idempotent: safe to run on both fresh and existing databases, and it leaves
-- the schema identical to what db/init/schema.sql creates (constraint and
-- indexes included).

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(10) NOT NULL DEFAULT 'temp';
ALTER TABLE addresses ALTER COLUMN expires_at DROP NOT NULL;

-- Same CHECK constraint as the fresh-install schema, added only when absent so
-- an upgraded database ends up structurally identical to a new one.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'addresses_type_check'
    ) THEN
        ALTER TABLE addresses
            ADD CONSTRAINT addresses_type_check CHECK (address_type IN ('temp', 'permanent'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_addresses_type ON addresses(address_type);
ALTER TABLE addresses ALTER COLUMN address_type SET DEFAULT 'temp';

COMMENT ON COLUMN addresses.address_type IS 'temp = auto-expiring temporary address, permanent = long-term mailbox';
