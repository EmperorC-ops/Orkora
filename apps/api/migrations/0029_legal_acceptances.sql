-- 0029_legal_acceptances.sql
--
-- Records each acceptance of a legal document (Terms of Service, Privacy
-- Policy, Organizer Agreement) with the version accepted, when, from where and
-- by whom. This is the evidence that a user agreed to the Terms (clickwrap).
--
-- One row per acceptance, append-only. organization_id is set only for the
-- Organizer Agreement, which an owner or admin accepts on behalf of the
-- organization. Rows go with the user or organization if either is deleted.
--
-- Forward-only, additive, idempotent. Folded into schema.sql for fresh installs.

BEGIN;

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  document        text        NOT NULL CHECK (document IN ('terms', 'privacy', 'organizer')),
  version         text        NOT NULL,
  source          text        NOT NULL DEFAULT 'prompt' CHECK (source IN ('signup', 'org_create', 'prompt')),
  ip              text,
  user_agent      text,
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_acceptances_org_doc CHECK (
    (document = 'organizer' AND organization_id IS NOT NULL)
    OR (document <> 'organizer' AND organization_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_doc_idx
  ON legal_acceptances (user_id, document, version);
CREATE INDEX IF NOT EXISTS legal_acceptances_org_doc_idx
  ON legal_acceptances (organization_id, document, version)
  WHERE organization_id IS NOT NULL;

COMMIT;
