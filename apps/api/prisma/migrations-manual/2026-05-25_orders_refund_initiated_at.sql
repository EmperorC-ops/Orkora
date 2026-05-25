-- Forward-only, additive migration: orders.refund_initiated_at
--
-- Run ONCE per environment (dev, staging, prod):
--   psql "<DATABASE_URL>" -f apps/api/prisma/migrations-manual/2026-05-25_orders_refund_initiated_at.sql
--
-- Why not `prisma db push`: db push diffs the entire schema and tries to DROP
-- the SQL-only objects that live in schema.sql but not schema.prisma
-- (event_metrics and the dependent materialized view event_daily_rollup), so it
-- aborts before applying anything. Until the safe migration workflow replaces
-- db push (see LAUNCH_RUNBOOKS section 1.1), apply additive changes with
-- explicit SQL like this.
--
-- Safety: adding a NULLable column is a metadata-only change in PostgreSQL 11+
-- (no table rewrite). The partial index only covers rows with a refund in
-- flight, so it stays tiny. Both statements are idempotent.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_initiated_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_refund_in_flight_idx
  ON orders (refund_initiated_at)
  WHERE status = 'paid' AND refund_initiated_at IS NOT NULL;
