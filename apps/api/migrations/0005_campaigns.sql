-- 0005_campaigns.sql
--
-- Adds the campaigns feature (organizer-initiated email sends with audience
-- segmentation and webhook-driven engagement tracking). Four new tables, all
-- tenancy-scoped at organization_id.
--
-- Forward-only. The migration runner takes a pg_advisory_lock and runs this
-- file in a single transaction; safe to re-run only because every CREATE uses
-- IF NOT EXISTS.

BEGIN;

-- ---------- campaign_audiences (created first, referenced by campaigns) ----------
CREATE TABLE IF NOT EXISTS campaign_audiences (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id        uuid        REFERENCES events(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  kind            text        NOT NULL CHECK (kind IN ('smart','custom')),
  smart_key       text,
  custom_spec     jsonb,
  cached_count    integer     NOT NULL DEFAULT 0,
  cached_at       timestamptz,
  created_by_id   uuid        NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_audiences_org_kind_idx     ON campaign_audiences (organization_id, kind);
CREATE INDEX IF NOT EXISTS campaign_audiences_org_event_idx    ON campaign_audiences (organization_id, event_id);

-- ---------- campaigns ----------
CREATE TABLE IF NOT EXISTS campaigns (
  id                uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id          uuid        REFERENCES events(id) ON DELETE SET NULL,
  name              text        NOT NULL,
  subject           text        NOT NULL,
  preview_text      text,
  body_markdown     text        NOT NULL,
  body_html         text        NOT NULL,
  from_name         text        NOT NULL,
  from_email        text        NOT NULL,
  reply_to          text,
  status            text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),
  send_mode         text        NOT NULL DEFAULT 'now'
                                CHECK (send_mode IN ('now','scheduled','triggered')),
  scheduled_at      timestamptz,
  trigger_spec      jsonb,
  audience_id       uuid        NOT NULL REFERENCES campaign_audiences(id),
  created_by_id     uuid        NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_started_at   timestamptz,
  sent_completed_at timestamptz,
  recipient_count   integer     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS campaigns_org_status_scheduled_idx ON campaigns (organization_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS campaigns_org_event_idx            ON campaigns (organization_id, event_id);

-- ---------- campaign_sends ----------
CREATE TABLE IF NOT EXISTS campaign_sends (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  campaign_id         uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             uuid        REFERENCES users(id),
  recipient_email     citext      NOT NULL,
  recipient_name      text,
  status              text        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN ('queued','sent','delivered','bounced','opened','clicked','unsubscribed','complained','failed')),
  postmark_message_id text,
  queued_at           timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  first_opened_at     timestamptz,
  first_clicked_at    timestamptz,
  bounced_at          timestamptz,
  unsubscribed_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_sends_campaign_email_uniq ON campaign_sends (campaign_id, recipient_email);
CREATE INDEX IF NOT EXISTS        campaign_sends_org_status_idx      ON campaign_sends (organization_id, status);
CREATE INDEX IF NOT EXISTS        campaign_sends_postmark_id_idx     ON campaign_sends (postmark_message_id);

-- ---------- email_suppressions ----------
CREATE TABLE IF NOT EXISTS email_suppressions (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           citext      NOT NULL,
  reason          text        NOT NULL CHECK (reason IN ('bounce','complaint','unsubscribe','manual')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_org_email_uniq ON email_suppressions (organization_id, email);
CREATE INDEX IF NOT EXISTS        email_suppressions_org_reason_idx ON email_suppressions (organization_id, reason);

COMMIT;
