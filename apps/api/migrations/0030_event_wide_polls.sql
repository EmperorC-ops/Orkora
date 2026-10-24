-- 0030_event_wide_polls.sql
--
-- Polls no longer need an agenda session. A poll now belongs to an event
-- (event_id, required) and optionally to one of its sessions (session_id,
-- now nullable). Single-talk events with no agenda can run polls.
--
-- Existing polls are backfilled with their session's event. Deleting the
-- event removes its polls; deleting a session still removes that session's
-- polls (unchanged).
--
-- Forward-only, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE polls ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE CASCADE;

UPDATE polls p
   SET event_id = s.event_id
  FROM sessions s
 WHERE p.session_id = s.id
   AND p.event_id IS NULL;

ALTER TABLE polls ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE polls ALTER COLUMN session_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS polls_event_id_idx ON polls (event_id);

COMMIT;
