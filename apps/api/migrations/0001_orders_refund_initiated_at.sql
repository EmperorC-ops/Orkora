-- 0001  orders.refund_initiated_at
--
-- Forward-only, additive migration. Applied automatically by the migration
-- runner (apps/api/scripts/migrate.mjs) on deploy, and recorded in the
-- schema_migrations table. Re-running is safe (idempotent guards).
--
-- This column is ALSO present in schema.sql (the canonical fresh-install
-- script), so a brand-new database already has it and this migration is a
-- no-op there. Every schema change must live in BOTH places: schema.sql for
-- fresh installs, and a numbered migration here for existing databases.
--
-- Safety: adding a NULLable column is metadata-only in PostgreSQL 11+ (no table
-- rewrite). The partial index only covers rows with a refund in flight.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_initiated_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_refund_in_flight_idx
  ON orders (refund_initiated_at)
  WHERE status = 'paid' AND refund_initiated_at IS NOT NULL;
