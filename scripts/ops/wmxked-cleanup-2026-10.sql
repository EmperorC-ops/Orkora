-- WMXKED cleanup, 2026-10 (revision 2: explicit ticket codes).
--
-- Revision 1 matched duplicates by holder name + email and found only 3 of the
-- 5 multi-ticket registrations; the owner reviewed them and confirmed that the
-- other 2 are genuine second guests. This revision acts ONLY on the ticket codes
-- the owner chose:
--
-- 1. Cancels the 3 outage duplicate tickets B2U63PVHRK, ZFMEEGUETK, TGRK6YB5AE
--    and releases their seats. Each of those attendees keeps their
--    registration and their other live ticket.
-- 2. Removes the test attendee's registration (test+regq@orkora.events),
--    including its ticket, and releases its seat.
-- 3. Removes the owner's own registration (Temitope Felix Sodeinde) the same
--    way. Matched by name (case and spacing ignored), but only if exactly one
--    registration matches, every ticket on it is held by that name (so no
--    guest ticket can be removed with it), and it has no order.
--
-- Mirrors how the app releases seats (payments.service.ts): tickets go to
-- status 'cancelled' and ticket_tiers.quantity_sold is decremented, clamped at
-- zero.
--
-- HOW TO RUN (owner only):
--   0. Take a Neon branch / snapshot of production first.
--   1. Run PART A on its own (read only). Confirm the 3 tickets and the 1 test
--      registration are the ones you expect.
--   2. Run PART B. It applies inside a transaction, asserts every guard, prints
--      the after-state, and STOPS without committing.
--   3. Expected after-state: 119 registrations and 121 live tickets (the two
--      genuine group registrations account for the extra 2; this assumes the
--      owner's registration holds one ticket, which Part A shows). If it
--      matches, type COMMIT; otherwise ROLLBACK; and nothing has changed.

-- =====================================================================
-- PART A: DRY RUN (read only)
-- =====================================================================

SELECT t.code, t.holder_name, t.holder_email, t.status,
       to_char(t.issued_at, 'DD Mon HH24:MI') AS issued,
       u.email AS registrant,
       (SELECT count(*) FROM tickets t2
          WHERE t2.registration_id = t.registration_id
            AND t2.status IN ('issued', 'checked_in')) AS live_on_registration_now
FROM tickets t
JOIN registrations r ON r.id = t.registration_id
JOIN users u ON u.id = r.user_id
JOIN events e ON e.id = r.event_id
WHERE e.code = 'WMXKED'
  AND t.code IN ('B2U63PVHRK', 'ZFMEEGUETK', 'TGRK6YB5AE')
ORDER BY registrant;

SELECT r.id AS registration_id, u.email, u.full_name, r.status, r.created_at,
       (SELECT count(*) FROM tickets t WHERE t.registration_id = r.id) AS tickets,
       (SELECT count(*) FROM orders o WHERE o.registration_id = r.id) AS orders
FROM registrations r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND u.email = 'test+regq@orkora.events';

-- The owner's registration: check the email shown is yours and that every
-- ticket listed is held in your name.
SELECT r.id AS registration_id, u.email, u.full_name, r.status, r.created_at,
       t.code, t.holder_name, t.status AS ticket_status,
       (SELECT count(*) FROM orders o WHERE o.registration_id = r.id) AS orders
FROM registrations r
JOIN users u ON u.id = r.user_id
LEFT JOIN tickets t ON t.registration_id = r.id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND (lower(regexp_replace(btrim(u.full_name), '\s+', ' ', 'g')) = 'temitope felix sodeinde'
       OR EXISTS (SELECT 1 FROM tickets t3 WHERE t3.registration_id = r.id
                  AND lower(regexp_replace(btrim(t3.holder_name), '\s+', ' ', 'g')) = 'temitope felix sodeinde'));

-- =====================================================================
-- PART B: APPLY (transaction; ends WITHOUT commit)
-- =====================================================================

BEGIN;

CREATE TEMP TABLE wmx_cancel ON COMMIT DROP AS
SELECT t.id, t.tier_id, t.registration_id, t.status
FROM tickets t
JOIN registrations r ON r.id = t.registration_id
JOIN events e ON e.id = r.event_id
WHERE e.code = 'WMXKED'
  AND t.code IN ('B2U63PVHRK', 'ZFMEEGUETK', 'TGRK6YB5AE');

CREATE TEMP TABLE wmx_test ON COMMIT DROP AS
SELECT r.id
FROM registrations r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND u.email = 'test+regq@orkora.events';

CREATE TEMP TABLE wmx_owner ON COMMIT DROP AS
SELECT r.id
FROM registrations r
JOIN users u ON u.id = r.user_id
WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
  AND (lower(regexp_replace(btrim(u.full_name), '\s+', ' ', 'g')) = 'temitope felix sodeinde'
       OR EXISTS (SELECT 1 FROM tickets t3 WHERE t3.registration_id = r.id
                  AND lower(regexp_replace(btrim(t3.holder_name), '\s+', ' ', 'g')) = 'temitope felix sodeinde'));

DO $$
DECLARE n_owner int; n_owner_foreign int; n_owner_orders int;
BEGIN
  SELECT count(*) INTO n_owner FROM wmx_owner;
  IF n_owner <> 1 THEN
    RAISE EXCEPTION 'Expected 1 registration for Temitope Felix Sodeinde, found %. Aborting.', n_owner;
  END IF;

  -- Every ticket on that registration must be held in the owner's name, so a
  -- guest's ticket can never be deleted along with it.
  SELECT count(*) INTO n_owner_foreign FROM tickets t
  WHERE t.registration_id IN (SELECT id FROM wmx_owner)
    AND lower(regexp_replace(btrim(t.holder_name), '\s+', ' ', 'g')) <> 'temitope felix sodeinde';
  IF n_owner_foreign <> 0 THEN
    RAISE EXCEPTION 'Owner registration carries % ticket(s) held by someone else. Aborting.', n_owner_foreign;
  END IF;

  SELECT count(*) INTO n_owner_orders FROM orders WHERE registration_id IN (SELECT id FROM wmx_owner);
  IF n_owner_orders <> 0 THEN
    RAISE EXCEPTION 'Owner registration has % order(s); refusing to delete. Aborting.', n_owner_orders;
  END IF;

  -- The owner and test registrations must be different rows.
  IF EXISTS (SELECT 1 FROM wmx_owner o JOIN wmx_test x ON x.id = o.id) THEN
    RAISE EXCEPTION 'Owner and test registration are the same row. Aborting.';
  END IF;
END $$;

DO $$
DECLARE n_cancel int; n_not_issued int; n_orphaned int; n_test int; n_orders int;
BEGIN
  SELECT count(*) INTO n_cancel FROM wmx_cancel;
  IF n_cancel <> 3 THEN
    RAISE EXCEPTION 'Expected 3 tickets on WMXKED with those codes, found %. Aborting.', n_cancel;
  END IF;

  -- Never cancel a checked-in, already cancelled, or void ticket.
  SELECT count(*) INTO n_not_issued FROM wmx_cancel WHERE status <> 'issued';
  IF n_not_issued <> 0 THEN
    RAISE EXCEPTION '% of the chosen tickets are not in status issued (checked in or already cancelled). Aborting.', n_not_issued;
  END IF;

  -- Every affected attendee must keep at least one live ticket afterwards.
  SELECT count(*) INTO n_orphaned
  FROM (SELECT DISTINCT registration_id FROM wmx_cancel) c
  WHERE NOT EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.registration_id = c.registration_id
      AND t.status IN ('issued', 'checked_in')
      AND t.id NOT IN (SELECT id FROM wmx_cancel)
  );
  IF n_orphaned <> 0 THEN
    RAISE EXCEPTION '% attendee(s) would be left with no live ticket. Aborting.', n_orphaned;
  END IF;

  SELECT count(*) INTO n_test FROM wmx_test;
  IF n_test <> 1 THEN
    RAISE EXCEPTION 'Expected 1 test registration, found %. Aborting.', n_test;
  END IF;

  SELECT count(*) INTO n_orders FROM orders WHERE registration_id IN (SELECT id FROM wmx_test);
  IF n_orders <> 0 THEN
    RAISE EXCEPTION 'Test registration has % order(s); refusing to delete. Aborting.', n_orders;
  END IF;
END $$;

-- 1. Cancel the 3 duplicates and release their seats.
UPDATE tickets SET status = 'cancelled'
WHERE id IN (SELECT id FROM wmx_cancel) AND status = 'issued';

UPDATE ticket_tiers tt
SET quantity_sold = GREATEST(0, tt.quantity_sold - c.n)
FROM (SELECT tier_id, count(*) AS n FROM wmx_cancel GROUP BY tier_id) c
WHERE tt.id = c.tier_id;

-- 2 and 3. Release the seats held by the test attendee's and the owner's
--    registrations, then remove both registrations. Their tickets are removed
--    with them (tickets.registration_id ON DELETE CASCADE).
UPDATE ticket_tiers tt
SET quantity_sold = GREATEST(0, tt.quantity_sold - c.n)
FROM (
  SELECT t.tier_id, count(*) AS n
  FROM tickets t
  WHERE t.registration_id IN (SELECT id FROM wmx_test UNION SELECT id FROM wmx_owner)
    AND t.status IN ('issued', 'checked_in')
  GROUP BY t.tier_id
) c
WHERE tt.id = c.tier_id;

DELETE FROM registrations
WHERE id IN (SELECT id FROM wmx_test UNION SELECT id FROM wmx_owner);

-- After-state. Expect registrations = 119 and live_tickets = 121.
SELECT
  (SELECT count(*) FROM registrations r
     WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')) AS registrations,
  (SELECT count(*) FROM tickets t JOIN registrations r ON r.id = t.registration_id
     WHERE r.event_id = (SELECT id FROM events WHERE code = 'WMXKED')
       AND t.status IN ('issued', 'checked_in')) AS live_tickets;

SELECT tt.name, tt.quantity_total, tt.quantity_sold
FROM ticket_tiers tt
WHERE tt.event_id = (SELECT id FROM events WHERE code = 'WMXKED');

-- Now type COMMIT; to keep the changes, or ROLLBACK; to undo everything.
