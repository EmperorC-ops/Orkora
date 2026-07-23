# Staging smoke test: discounts, recordings, live engagement

Run this against staging after the deploy goes green. It also re-checks the
group-ticket and feedback work from the same batch. Tick each box; if a step
fails, note the request/response (Network tab) and stop on that feature.

Pre-req: an organizer login on staging, one test event you can edit, and at
least one PAID ticket tier (non-zero price) plus one FREE tier on that event.
Keep the browser DevTools Network tab open throughout.

## 0. Deploy sanity (do first)

- [ ] API deploy logs show the migration runner applying `0007_discount_codes`,
      `0008_recordings`, `0009_qa_moderation` (or "already applied" on a rerun).
      No errors, no `db push`.
- [ ] `GET https://<staging-api>/v1/health` (or your health path) returns OK.
- [ ] Open the organizer event detail page. The action row now shows four new
      links: Feedback, Discounts, Recordings, Live. All four open without a
      client error.

## 1. Discount codes

Organizer setup
- [ ] Event > Discounts. Create a PERCENT code (e.g. `SAVE20`, 20%, no limit,
      no dates, active). It appears in the list showing "20% off".
- [ ] Create a FIXED code (e.g. `FLAT5`, fixed, value 500, currency = the paid
      tier's currency). It shows the fixed amount formatted (5.00 in that
      currency).
- [ ] Create a code with `max redemptions = 1` (e.g. `ONCE`). List shows the
      remaining count.
- [ ] Edit a code (flip active off then on). Delete a throwaway code. Both
      persist after refresh.

Attendee redemption (public register page)
- [ ] Open the public register page for the event, pick the PAID tier. The
      "Apply code" box shows (paid tiers only).
- [ ] Apply `SAVE20`. The summary shows a discount line and the total drops by
      20 percent. Apply `FLAT5` instead: total drops by the fixed amount.
- [ ] Apply a nonsense code (`NOPE`). You get a clear "invalid" message and the
      total is unchanged.
- [ ] Apply `SAVE20`, then change the ticket quantity or switch tier. The
      applied discount clears (so a stale code is never sent).
- [ ] Complete a paid registration WITH `SAVE20` applied. In the payment
      provider (Stripe/Paystack test mode) the charged amount equals the
      discounted total, not the full price.
- [ ] Redeem `ONCE` on one order, then try it on a second order. The second
      attempt is rejected as used up. (Confirms the usage cap holds.)
- [ ] Optional race check: not required manually, but confirm one order created
      exactly one row in `discount_redemptions` and `times_redeemed` went to 1.

Guardrails
- [ ] Currency mismatch: make a FIXED code in a currency different from the
      tier, try to apply it. It is rejected with a currency message.
- [ ] A free-tier registration shows no discount box and still completes.

## 2. Recording library + player

Organizer setup
- [ ] Event > Recordings. Add a LINK recording: paste a YouTube URL, title it,
      visibility = public, publish. It appears published in the list.
- [ ] Add a second LINK recording (an HLS `.m3u8` or an mp4 URL if you have
      one), visibility = ticket, publish.
- [ ] Add a recording gated to a specific TIER (visibility = tier, pick the
      paid tier), publish.
- [ ] Add an UPLOAD recording: choose a small video file (under the 8 MB upload
      cap). It presigns, PUTs to R2, and saves with a storage key. Publish it.
      (Larger videos should be links; the UI says so.)
- [ ] Toggle one recording to unpublished. Confirm it disappears from the public
      list (next step) while staying visible to you.

Public watch page
- [ ] Open `/(public)` event `/watch` page (linked from the event, or
      `https://<staging-web>/e/<CODE>/watch`). Only PUBLISHED recordings show.
- [ ] The public recording plays with no ticket prompt (YouTube/Vimeo embeds;
      mp4/HLS uses the native player; HLS only plays natively in Safari, that is
      expected).
- [ ] A ticket-gated recording prompts for a ticket code. Enter a VALID issued
      ticket code for this event: it plays. Enter a random string: it is
      refused with a clear message.
- [ ] The tier-gated recording: a ticket for the WRONG tier is refused; a ticket
      for the REQUIRED tier plays.
- [ ] Confirm gated playback URLs are not present in the public list response
      (Network tab: `GET /v1/events/<CODE>/recordings` returns metadata only;
      the URL only comes back from the `.../play` POST after the ticket check).

## 3. Live engagement (polls + Q&A moderation)

Poll create (organizer)
- [ ] Event > Live. In the poll form, pick a session, enter a question, add 3
      options, leave single-choice. Create. The poll appears in the list with 0
      votes and an open status.
- [ ] Create a second poll with "multiple choice" checked.
- [ ] Close an open poll. Its status flips to closed and the Close button goes
      away.
- [ ] Cross-check on the attendee/live view (public live page for the event):
      the open poll is visible and votable; a vote increments the count on the
      organizer list after refresh.

Q&A moderation (organizer)
- [ ] As an attendee (or via the public live/Q&A view) post a question on the
      event.
- [ ] Event > Live, Q&A section: the question shows with its upvote count.
- [ ] Mark it answered. An "answered" badge appears; unmark returns it.
- [ ] Hide it. The row dims and is flagged hidden; the public Q&A list no longer
      shows it. Unhide restores it.
- [ ] Confirm a non-organizer cannot hit the moderation endpoints (the
      `.../qa/:id/answered` and `.../hidden` PATCH routes are organizer-only; a
      plain attendee token should get 403).

## 4. Regression (same batch, quick pass)

- [ ] Group ticket: a tier flagged group with min size N still forces N
      attendee rows and blocks Continue until met; per-person pricing unchanged.
- [ ] Feedback: on a live/ended event the public page still shows the feedback
      form, and the organizer Feedback tab still renders the summary.
- [ ] Speaker/session/track edit still works on the event detail page.
- [ ] Existing paid checkout WITHOUT a discount still charges full price.

## Rollback notes

- All three migrations are additive (new tables + nullable columns), so a code
  rollback does not require a DB rollback. If a feature misbehaves, revert the
  web/API commit and the new tables simply go unused.
- Discounts touch the registration transaction. If checkout regresses, that is
  the first place to look: an order created without a `discountCode` must set
  `discount_minor = 0` and `total_minor = subtotal_minor` exactly as before.
