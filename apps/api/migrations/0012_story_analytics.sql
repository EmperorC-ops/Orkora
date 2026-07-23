-- 0012_story_analytics.sql
--
-- Story Mode engagement analytics. Raw, append-only event rows emitted by the
-- public renderer: page views, per-block impressions, scroll depth, and the
-- moment a reader reaches the tickets block. Aggregated for the organiser
-- dashboard; never contains PII (the visitor column is an opaque client id).
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS story_analytics (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  event_id      uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind          text        NOT NULL,
  block_type    text,
  block_index   int,
  depth_percent int,
  visitor       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_analytics_event_created_idx
  ON story_analytics (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS story_analytics_event_kind_idx
  ON story_analytics (event_id, kind);

COMMIT;
