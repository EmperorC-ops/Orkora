-- 0013_brand_analytics.sql
--
-- Brand-level engagement analytics for the flagship release metrics: Brand Home
-- views (with traffic source) and Shareable Card generation/views/downloads.
-- Org-scoped, raw, append-only. Complements story_analytics (which is
-- event-scoped). Never contains PII: visitor is an opaque client token.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS brand_analytics (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            text        NOT NULL,
  source          text,
  meta            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  visitor         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_analytics_org_created_idx
  ON brand_analytics (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brand_analytics_org_kind_idx
  ON brand_analytics (organization_id, kind);

COMMIT;
