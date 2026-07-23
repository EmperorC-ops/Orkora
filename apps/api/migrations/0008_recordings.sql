-- 0008_recordings.sql
--
-- Session/event recordings. A recording is either an external link (YouTube,
-- Vimeo, or an HLS URL) or an uploaded file living under an R2 storage key.
-- Access is gated by `visibility`: 'public' (anyone), 'ticket' (any ticket
-- holder for the event), or 'tier' (holders of `required_tier_id`). Unpublished
-- recordings (published_at NULL) are organizer-only.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS recordings (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  event_id         uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id       uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  title            text        NOT NULL,
  description      text,
  source           text        NOT NULL CHECK (source IN ('link','upload')),
  url              text,
  storage_key      text,
  duration_sec     integer,
  visibility       text        NOT NULL DEFAULT 'ticket' CHECK (visibility IN ('public','ticket','tier')),
  required_tier_id uuid        REFERENCES ticket_tiers(id) ON DELETE SET NULL,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- a link recording needs a url; an upload needs a storage key
  CONSTRAINT recordings_source_shape CHECK (
    (source = 'link'   AND url IS NOT NULL) OR
    (source = 'upload' AND storage_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS recordings_event_idx   ON recordings (event_id);
CREATE INDEX IF NOT EXISTS recordings_session_idx ON recordings (session_id);

COMMIT;
