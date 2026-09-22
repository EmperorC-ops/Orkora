-- 0016_order_settlement_hold.sql
--
-- Settlement quarantine for orders whose captured amount does not match the
-- order total.
--
-- Until now every settlement path (provider webhook, verify-on-return,
-- reconciliation sweep) trusted the provider's `status` alone and never
-- compared the amount actually captured against `orders.total_minor`, or the
-- currency actually charged against `orders.currency`. Flutterwave's own
-- integration guidance is explicit that status, amount, currency and tx_ref
-- must all be matched against your record before value is given; we matched
-- only status.
--
-- The check now runs in `markOrderPaid`. An underpayment or a currency
-- mismatch must NOT issue tickets, but it must also not be silently released
-- by the stale-hold sweep while the customer's money sits with the provider.
-- These two columns are that middle state: the order stays `pending` (so no
-- existing status consumer changes behaviour) and is held out of the sweep
-- until a human or a corrected settlement resolves it.
--
--   settlement_hold_at      when the mismatch was detected (null = not held)
--   settlement_hold_reason  machine-readable code: 'underpaid' | 'currency_mismatch'
--   settlement_hold_detail  jsonb: what the provider reported vs what we expected
--
-- Overpayments are deliberately NOT held. The buyer is not at fault and must
-- get the ticket they paid for; the excess is recorded as an audit event for
-- finance to refund.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_hold_at     timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_hold_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_hold_detail jsonb;

-- Partial index: the only queries are "show me everything currently held",
-- which is a small set and should stay cheap even as orders grows.
CREATE INDEX IF NOT EXISTS orders_settlement_hold_idx
  ON orders (settlement_hold_at DESC)
  WHERE settlement_hold_at IS NOT NULL;

COMMIT;
