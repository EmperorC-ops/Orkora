-- Message upvotes for the Q&A feature.
-- Run once on the existing database:
--   docker exec -i orkora-postgres psql -U orkora -d orkora < migrations/2026-04-28-add-message-upvotes.sql
--
-- Adding to schema.sql afterwards keeps fresh installs consistent.

create table if not exists message_upvotes (
  id          uuid primary key default uuidv7(),
  message_id  uuid not null references messages(id) on delete cascade,
  user_id     uuid not null references users(id),
  created_at  timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_upvotes_message_idx on message_upvotes (message_id);
create index if not exists message_upvotes_user_idx on message_upvotes (user_id);
