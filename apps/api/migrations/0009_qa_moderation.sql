-- 0009_qa_moderation.sql
--
-- Q&A moderation. Questions live in `messages` with kind='qa' on their channel.
-- Organizers can now mark a question answered (answered_at) in addition to the
-- existing soft-delete (deleted_at) used to hide it. Both are nullable
-- timestamps so "unmark" is just setting them back to NULL.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS answered_at timestamptz;

COMMIT;
