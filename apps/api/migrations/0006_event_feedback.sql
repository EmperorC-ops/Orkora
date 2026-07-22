-- 0006_event_feedback.sql
--
-- Adds attendee feedback for events and their individual sessions. One table,
-- tenancy-scoped at organization_id so the organizer dashboard and RLS policy
-- behave like every other tenant table.
--
-- Scope (agreed 2026-07-22): feedback attaches to either the whole event
-- (session_id NULL) or a single session (session_id set). Each submission may
-- carry a 1-5 star rating, a 0-10 NPS score, and an optional free-text comment.
-- Collected from the public web event page; submission is always optional and
-- may be anonymous, so user_id / attendee_email are both nullable.
--
-- Forward-only, additive, idempotent. The same DDL is folded into schema.sql so
-- fresh installs get it too. The migration runner wraps this file in a single
-- transaction under an advisory lock.

BEGIN;

CREATE TABLE IF NOT EXISTS event_feedback (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id        uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id      uuid        REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES users(id) ON DELETE SET NULL,
  attendee_email  citext,
  rating          smallint    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  nps_score       smallint    CHECK (nps_score IS NULL OR nps_score BETWEEN 0 AND 10),
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- A submission must carry at least one signal: a rating, an NPS score, or a
  -- non-empty comment. An all-empty row is meaningless.
  CONSTRAINT event_feedback_has_content CHECK (
    rating IS NOT NULL
    OR nps_score IS NOT NULL
    OR (comment IS NOT NULL AND length(btrim(comment)) > 0)
  )
);

-- Organizer dashboard reads all feedback for an event, newest first.
CREATE INDEX IF NOT EXISTS event_feedback_event_created_idx
  ON event_feedback (event_id, created_at DESC);

-- Per-session breakdown filters on session_id (only the session rows).
CREATE INDEX IF NOT EXISTS event_feedback_session_idx
  ON event_feedback (session_id) WHERE session_id IS NOT NULL;

-- Tenant-scoped queries / RLS predicate.
CREATE INDEX IF NOT EXISTS event_feedback_org_idx
  ON event_feedback (organization_id);

-- Tenant isolation, consistent with the other event sub-resources. The public
-- submit path resolves the event's organization_id and inserts it explicitly;
-- the app's DB owner role bypasses RLS, and non-owner roles are constrained to
-- their own org exactly like events/sessions/etc.
ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation_event_feedback ON event_feedback;
CREATE POLICY org_isolation_event_feedback ON event_feedback
  USING (organization_id = current_setting('app.org_id', true)::uuid);

COMMIT;
