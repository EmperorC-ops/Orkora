-- 0011_story_mode.sql
--
-- Story Mode: compose the event page as a scroll-narrative instead of a form.
-- Adds a block composition (JSONB), the chosen starting template, and the
-- publish timestamp that flips an event from the classic layout to the
-- Story Mode renderer.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.
-- Existing events keep story_blocks = '[]' and story_published_at = NULL, so
-- they render through the classic layout untouched until an organiser composes
-- and publishes a story.

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS story_blocks       jsonb       NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS story_template     text        NOT NULL DEFAULT 'classic';
ALTER TABLE events ADD COLUMN IF NOT EXISTS story_published_at timestamptz;

-- Constrain the template to the five known seeds. 'classic' is the migration
-- default so existing muscle memory (and existing events) keep working.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_story_template_check'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_story_template_check
      CHECK (story_template IN ('classic','editorial','cinematic','underground','runway'));
  END IF;
END $$;

COMMIT;
