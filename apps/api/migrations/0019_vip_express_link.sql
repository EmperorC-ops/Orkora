-- 0019_vip_express_link.sql
-- VIP express registration link.
--
-- Two additions:
--   1. events.vip_token: a per-event shared secret. When set, anyone holding
--      the link (/e/<code>/vip?t=<token>) can register with name + email only,
--      skipping the event's custom question set. Nullable so an event has no
--      VIP link until the organizer generates one. Unique so a token resolves
--      to exactly one event (Postgres allows many NULLs under a unique index,
--      which is what we want: many events with no token yet).
--   2. registrations.is_vip: marks a registration created through the VIP link,
--      so the dashboard and CSV export can tag it.
--
-- Forward-only and idempotent, per the migration convention.

alter table events add column if not exists vip_token text;
create unique index if not exists events_vip_token_key on events (vip_token);

alter table registrations add column if not exists is_vip boolean not null default false;
