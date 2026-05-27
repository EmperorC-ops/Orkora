-- 0002  Hot-path indexes
--
-- Forward-only, additive. Each statement uses CREATE [UNIQUE] INDEX IF NOT
-- EXISTS so re-running is a no-op. The same indexes are also in schema.sql so
-- a fresh install gets them too (per the workflow in LAUNCH_RUNBOOKS 1.1).
--
-- These cover the hot reads we run today (refresh-token lookup on every API
-- refresh, OTP cooldown/cap on every signup, payment reconciliation cron,
-- per-event detail loads, attendee order history, live chat/Q&A channel
-- resolution). Write cost on each table is negligible at private-beta scale;
-- these become real wins as the dataset grows.
--
-- Note: CREATE INDEX (not CONCURRENTLY) runs inside the migration runner's
-- transaction. Acceptable at current scale. When a table is large enough to
-- matter, ship that index in its own file with the runner upgraded to allow
-- non-transactional migrations.

-- Refresh tokens: looked up by token_hash on every API token refresh; scanned
-- by user_id on logout / reuse detection.
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_key
  ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
  ON refresh_tokens (user_id);

-- OTP: cooldown, hourly per-destination cap, and verify all hit
-- (destination, purpose) with a recency filter.
CREATE INDEX IF NOT EXISTS otp_codes_destination_purpose_created_at_idx
  ON otp_codes (destination, purpose, created_at DESC);

-- Event sub-resources: list/lookup by event_id. Sessions already had
-- (event_id, start_at); these complete the picture.
CREATE INDEX IF NOT EXISTS tracks_event_id_idx ON tracks (event_id);
CREATE INDEX IF NOT EXISTS speakers_event_id_idx ON speakers (event_id);
CREATE INDEX IF NOT EXISTS ticket_tiers_event_id_position_idx
  ON ticket_tiers (event_id, position);

-- Orders: TTL release + payment reconciliation filter by (status, created_at);
-- attendee / my-orders read by (user_id, created_at desc). The
-- orders_refund_in_flight partial index from migration 0001 covers the refund
-- reconciliation sweep separately.
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx
  ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx
  ON orders (user_id, created_at DESC);

-- Order items: cascade reads + tier joins are always by order_id.
CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON order_items (order_id);

-- Live engagement: getOrCreateEventChat / getOrCreateEventQa find by
-- (event_id, kind).
CREATE INDEX IF NOT EXISTS channels_event_id_kind_idx
  ON channels (event_id, kind);

-- Polls: per-session lookups when shaping individual polls.
CREATE INDEX IF NOT EXISTS polls_session_id_idx ON polls (session_id);
