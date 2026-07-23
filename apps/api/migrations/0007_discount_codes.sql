-- 0007_discount_codes.sql
--
-- Order-wide discount codes. A code is either a percentage (value = 1..100) or
-- a fixed amount (value = minor units, in `currency`). Applied to the order
-- subtotal at registration time; the redeemed amount and code are stamped on
-- the order, and a redemption row (unique per order) enforces the usage cap.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS discount_codes (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  event_id        uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code            text        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('percent','fixed')),
  value           integer     NOT NULL CHECK (value > 0),
  currency        char(3),
  max_redemptions integer,
  times_redeemed  integer     NOT NULL DEFAULT 0,
  starts_at       timestamptz,
  ends_at         timestamptz,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- percent codes must be 1..100
  CONSTRAINT discount_codes_percent_range CHECK (kind <> 'percent' OR value BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_event_code_uniq ON discount_codes (event_id, code);
CREATE INDEX IF NOT EXISTS discount_codes_event_idx ON discount_codes (event_id);

CREATE TABLE IF NOT EXISTS discount_redemptions (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  discount_code_id uuid        NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  order_id         uuid        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id          uuid        REFERENCES users(id),
  amount_minor     bigint      NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discount_redemptions_code_idx ON discount_redemptions (discount_code_id);

-- Order-level discount stamp.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_minor   bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id uuid REFERENCES discount_codes(id);

COMMIT;
