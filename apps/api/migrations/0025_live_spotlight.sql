-- 0025_live_spotlight.sql
--
-- Organizer "on screen now" broadcast for the live second screen. One current
-- item per event (unique event_id): an announcement, a link, or an embedded
-- video, shown at the top of every participant's live page. active toggles it
-- on and off without losing the content. Additive and safe on a live database.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS live_spotlights (
  id                 uuid primary key default uuidv7(),
  event_id           uuid not null unique references events(id) on delete cascade,
  kind               text not null,
  title              text,
  body               text,
  url                text,
  active             boolean not null default true,
  updated_by_user_id uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

COMMIT;
