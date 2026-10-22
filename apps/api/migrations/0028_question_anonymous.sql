-- 0028_question_anonymous.sql
--
-- Lets an attendee ask a live Q&A question anonymously. When set, the
-- question is shown as "Anonymous" in the attendee feed and in the
-- organizer's Live Control console. The author's user id is still stored on
-- the row (as for every message) so abuse can be traced at the database level
-- if ever needed, but no screen displays it.
--
-- Not null, default false: every existing message stays attributed as before.
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

COMMIT;
