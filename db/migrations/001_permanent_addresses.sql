-- 001: permanent (long-term) mailboxes
-- Adds address_type and makes expires_at nullable for permanent addresses.
-- Idempotent: safe to run on both fresh and existing databases.

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_type VARCHAR(10) NOT NULL DEFAULT 'temp';
ALTER TABLE addresses ALTER COLUMN expires_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_addresses_type ON addresses(address_type);

COMMENT ON COLUMN addresses.address_type IS 'temp = auto-expiring temporary address, permanent = long-term mailbox';
