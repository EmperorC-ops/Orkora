-- Audit log for sensitive actions.
-- Run once on the existing database:
--   docker exec -i orkora-postgres psql -U orkora -d orkora < migrations/2026-04-28-add-audit-events.sql
--
-- Anything that touches money, role membership, or destroys data writes a
-- row here. Read-only by design from the API; exports for compliance go
-- through the dashboard.

create table if not exists audit_events (
  id              uuid primary key default uuidv7(),
  organization_id uuid references organizations(id) on delete set null,
  actor_user_id   uuid references users(id) on delete set null,
  action          text not null,
  resource_type   text not null,
  resource_id     uuid,
  metadata        jsonb not null default '{}'::jsonb,
  request_id      text,
  occurred_at     timestamptz not null default now()
);

create index if not exists audit_events_org_idx on audit_events (organization_id, occurred_at desc);
create index if not exists audit_events_actor_idx on audit_events (actor_user_id, occurred_at desc);
create index if not exists audit_events_resource_idx on audit_events (resource_type, resource_id);
