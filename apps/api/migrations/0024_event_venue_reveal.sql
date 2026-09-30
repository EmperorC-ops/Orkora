-- 0024_event_venue_reveal.sql
--
-- Venue reveal: an event can carry a venue name, full street address and an
-- online join link that are withheld from the public event page and revealed
-- only on the attendee's ticket (and ticket email) after they register. The
-- reveal is controlled per event by location_on_ticket_only. Defaults keep every
-- existing event public and unchanged (no venue set, gate off), so this is safe
-- to apply to a live database.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS venue_name              text,
  ADD COLUMN IF NOT EXISTS venue_address           text,
  ADD COLUMN IF NOT EXISTS join_url                text,
  ADD COLUMN IF NOT EXISTS location_on_ticket_only boolean NOT NULL DEFAULT false;

COMMIT;
