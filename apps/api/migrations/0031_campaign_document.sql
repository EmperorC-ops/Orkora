-- 0031_campaign_document.sql
--
-- Optional PDF document (for example a newsletter) on a campaign, linked from
-- the email with a Download button, plus per-recipient download counts.
--
-- campaign_document_downloads holds one row per campaign and recipient key
-- (a keyed hash of the recipient's email, never the email itself), with how
-- many times that recipient opened the document. Rows go with the campaign.
--
-- Nullable columns, new table: existing campaigns are unchanged.
-- Forward-only, additive, idempotent. Not folded into schema.sql: the campaign
-- tables are created by migration 0005, so like 0026 this lives only here.

BEGIN;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS document_name text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS document_size_bytes integer;

CREATE TABLE IF NOT EXISTS campaign_document_downloads (
  campaign_id     uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_key   text        NOT NULL,
  download_count  integer     NOT NULL DEFAULT 1,
  first_at        timestamptz NOT NULL DEFAULT now(),
  last_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, recipient_key)
);

COMMIT;
