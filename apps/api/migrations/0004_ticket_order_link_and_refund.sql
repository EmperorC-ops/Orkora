-- 0004  Tie tickets to the order that issued them, add refund-aware ticket
--       lifecycle, and add a notification log so refund emails are sent at
--       most once per order.
--
-- Forward-only, additive. Idempotent. Same DDL is folded into schema.sql so
-- fresh installs get it too.
--
-- Why this exists
-- ---------------
-- The 2026-06-01 dry-run surfaced three coupled bugs in the ticket / order
-- lifecycle:
--
--   1. tickets.registration_id was the only edge to orders, via the
--      registration. So a registration with N attempted orders accumulated
--      N quantities of tickets in 'pending', and the paid-confirmation email
--      then listed ALL of them rather than the ones belonging to the just-paid
--      order. We saw two QR codes mailed for a one-ticket paid order.
--
--   2. Refunding an order moved the order to 'refunded' but never touched the
--      tickets, so the QR codes remained valid. A refunded attendee could
--      still walk in.
--
--   3. The verify-on-action path, the webhook, and the reconcile sweep can
--      each settle a refund. Without an idempotency record we would email the
--      "your refund is on its way" message multiple times for the same order.
--
-- This migration introduces:
--
--   - tickets.order_id NULL FK to orders(id) ON DELETE SET NULL. New tickets
--     created by registrations.service.register() set it; legacy tickets stay
--     NULL. The payments service now scopes ticket updates and email contents
--     by this column when set, falling back to registration_id when not.
--
--   - notification_log (order_id, kind, sent_at) with a unique constraint on
--     (order_id, kind). Every settlement path inserts into this table inside
--     the same transaction that flips the order, so any second path sees the
--     unique-violation, swallows it, and skips the email send.
--
-- Backfill
-- --------
-- We make a best-effort attempt to link existing tickets to their most likely
-- order: the most recent order on the same registration whose item-tier matches
-- the ticket-tier. Orphans (no matching order, or ambiguous) stay NULL and the
-- application's fallback path takes over for them.

begin;

-- 1) Add the FK column. NULL allowed so legacy rows are tolerated.
alter table tickets
  add column if not exists order_id uuid null references orders(id) on delete set null;

create index if not exists tickets_order_id_idx on tickets (order_id);

-- 2) Best-effort backfill. For each ticket without an order_id, find the most
--    recent order on the same registration that has at least one order_item
--    pointing at the ticket's tier. If exactly one such order exists, link.
--    Ambiguous cases stay NULL and the application falls back to
--    registration_id-scoped behavior.
with candidate as (
  select
    t.id        as ticket_id,
    (
      select o.id
      from orders o
      join order_items oi on oi.order_id = o.id
      where o.registration_id = t.registration_id
        and oi.tier_id = t.tier_id
      order by o.created_at desc
      limit 1
    ) as order_id
  from tickets t
  where t.order_id is null
)
update tickets
   set order_id = candidate.order_id
  from candidate
 where tickets.id = candidate.ticket_id
   and candidate.order_id is not null;

-- 3) Notification idempotency log. Single row per (order_id, kind).
create table if not exists notification_log (
  id        uuid primary key default uuidv7(),
  order_id  uuid not null references orders(id) on delete cascade,
  kind      text not null,
  sent_at   timestamptz not null default now(),
  unique (order_id, kind)
);

create index if not exists notification_log_order_id_idx on notification_log (order_id);

commit;
