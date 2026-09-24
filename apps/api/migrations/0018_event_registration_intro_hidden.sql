-- 0018_event_registration_intro_hidden.sql
--
-- Per-event control to hide the boilerplate intro ("A few questions" heading
-- and its subtitle) above the custom questions on the public register form.
-- Some organizers want the questions to stand on their own. Defaults to false
-- (intro shown), so every existing event is unchanged.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS registration_intro_hidden boolean NOT NULL DEFAULT false;

COMMIT;
