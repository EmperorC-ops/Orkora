-- Webhook event-id ledger.
-- Run once on the existing database:
--   docker exec -i orkora-postgres psql -U orkora -d orkora < migrations/2026-04-28-add-webhook-events.sql
--
-- Stripe / Paystack / Flutterwave can deliver the same event twice within a
-- few hundred milliseconds. The order state machine already serialises
-- correctness, but a duplicate delivery in the small window between
-- "received" and "marked paid" could fire two confirmation emails. This
-- table is consulted before any side effect: insert wins -> process; ON
-- CONFLICT -> skip and return 200 so the provider stops retrying.

create table if not exists webhook_events (
  id                uuid primary key default uuidv7(),
  provider          text not null,
  provider_event_id text not null,
  received_at       timestamptz not null default now(),
  outcome           text,
  unique (provider, provider_event_id)
);

create index if not exists webhook_events_provider_idx on webhook_events (provider, received_at desc);
