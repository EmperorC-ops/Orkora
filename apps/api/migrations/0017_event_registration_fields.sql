-- 0017_event_registration_fields.sql
--
-- Custom registration questions: a per-event list of question definitions
-- (label, type, required, options). Answers are stored per registration in the
-- existing registrations.form_responses column; this adds the definition side.
-- Defaults to an empty array so existing events keep behaving exactly as they
-- do now (no extra questions until an organizer adds them).
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS registration_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
