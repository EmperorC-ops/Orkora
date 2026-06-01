-- 0003  Per-account login backoff (LoginFailure)
--
-- Forward-only, additive. Idempotent. Same DDL is in schema.sql so fresh
-- installs get it too.
--
-- Backs auth.service.login()'s exponential-backoff defense: each consecutive
-- failed password attempt against an email gets a longer locked_until window
-- (1s, 2s, 4s, ..., capped at 60s). Cleared on first successful login. This
-- closes the gap where the per-IP rate limiter cannot stop a distributed brute
-- force targeting one account across many source IPs.

CREATE TABLE IF NOT EXISTS login_failures (
  email_lower    text PRIMARY KEY,
  failed_count   int NOT NULL DEFAULT 0,
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until   timestamptz
);
