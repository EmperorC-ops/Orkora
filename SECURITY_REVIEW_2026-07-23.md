# Security review: 2026-07-23

Scope: a fresh code-level audit of the Orkora API and web app, focused on the
attack surface added since the last review (discount codes, recording library +
gated player, live engagement moderation, group tickets, attendee feedback),
plus a regression sweep of the core auth, tenancy, and payment invariants.

Method: static source review. The dynamic scanners in `pnpm security:all`
(OWASP ZAP, TruffleHog, dependency CVE audit) were NOT run in this pass because
they need network access and a working toolchain that the review environment
could not provide. Re-run `pnpm security:all` in CI for the dynamic layer; this
report covers the code-level findings the scanners do not catch.

## Summary

One MEDIUM finding (gated recording confidentiality), one LOW finding (fixed in
this pass), and a set of verified-good controls. No critical or high issues. The
new features follow the established tenancy, parameterization, and rate-limit
patterns.

| ID | Severity | Area | Status |
| -- | -------- | ---- | ------ |
| R-1 | Medium | Recordings: gated uploads served from a public bucket | Open, remediation below |
| D-1 | Low | Discounts: percent value had no app-layer ceiling | Fixed in this pass |
| Notes | Info | Enumeration / brute-force surface | Accepted (throttled, high-entropy) |

## R-1 (Medium) Gated recordings are only gated at URL hand-out, not at storage

Files: `apps/api/src/modules/recordings/recordings.service.ts`
(`resolvePlayback`, `playbackUrlFor`), `apps/api/src/modules/uploads/storage.service.ts`
(`publicUrlFor`).

For an uploaded recording with visibility `ticket` or `tier`, the API validates
the viewer's ticket before returning a playback URL, but that URL is the object's
public-read R2 URL (`S3_PUBLIC_BASE_URL + '/' + storageKey`). The ticket check
therefore gates the hand-out of the URL, not access to the object itself. Once a
legitimate ticket holder has the URL, it can be shared and will play for anyone,
with no expiry.

Mitigating factors: storage keys embed a v4 UUID
(`recordings/<userId>/<uuid>.<ext>`, see `uploads.service.ts`), so the URL is not
guessable or enumerable. Exploitation requires a URL to leak from a legitimate
holder, not brute force. The public listing never exposes the URL for gated
recordings (verified: `listPublic` returns metadata only).

Impact: confidentiality of paid or ticket-gated recordings is best-effort, not
enforced. A determined attendee can redistribute gated content.

Remediation options (pick per how sensitive recordings are):
1. Serve uploaded recordings from a private R2 bucket and return short-lived
   signed GET URLs. Add `getSignedDownloadUrl(key, ttl)` to `StorageService`
   (mirror the existing presign signing) and have `playbackUrlFor` call it for
   uploads. This makes each playback URL expire, so a shared link dies quickly.
2. If keeping the public bucket, treat gated recordings as "unlisted, not
   private" and document that in the organizer UI so expectations are honest.
   For `link` recordings the same caveat already applies (a YouTube unlisted
   link is not truly private), so option 2 keeps link and upload behavior
   consistent.

Recommended: option 1 for uploads before promoting recordings to paid tiers.

## D-1 (Low) Discount percent had no application-layer upper bound (fixed)

Files: `apps/api/src/modules/discounts/dto/discount.dto.ts`,
`apps/api/src/modules/discounts/discounts.service.ts`.

`value` was validated as an integer >= 1 with no maximum. For a `percent` code a
value above 100 was only rejected by the database CHECK constraint, which would
surface as a 500 rather than a clean 400, and the DTO comment incorrectly
claimed the service enforced the 1..100 ceiling.

No financial impact: `computeDiscountMinor` clamps the discount to the subtotal
and the order total is clamped to >= 0, so even a percent above 100 could never
produce a negative total or refund. This was a robustness and input-validation
gap, not a money bug.

Fix applied this pass: `createCode` and `updateCode` now reject a `percent`
value outside 1..100 with a `BadRequestException`, matching the DTO's documented
contract and the DB constraint.

## Verified-good controls (no action needed)

Discounts
- Raw SQL in the registration transaction is fully parameterized (bind params
  `$1..$4`, `::uuid` casts, no string interpolation). No SQL injection.
- The redemption cap is race-safe: the `discount_codes` row is locked with
  `SELECT ... FOR UPDATE` and `times_redeemed` is re-checked and incremented
  inside the same transaction, so concurrent buyers cannot exceed the cap.
- The discount code lookup is scoped to the registration's own event
  (`where event_id = $1 and code = $2`), so a code from another event cannot be
  applied cross-event.
- Codes are trimmed and uppercased consistently on create, update, validate, and
  redeem. Discount amount is clamped to the subtotal; total clamped to >= 0.
- Organizer CRUD is tenancy-scoped via `assertEventInOrg`; the public validate
  endpoint is throttled (20 / 60s) and rejects draft/archived events and
  suspended orgs.

Recordings
- Every organizer method calls `assertEvent(orgId, eventId)`, and update/delete
  resolve the row with `findFirst({ id, eventId })`, so there is no cross-event
  or cross-org IDOR.
- Ticket validation for gated playback checks status `issued` AND that the
  ticket's registration belongs to the event; tier gating additionally requires
  `ticket.tierId === requiredTierId`. A ticket from another event or tier is
  rejected.
- Playback URLs are never returned from the public list endpoint for gated
  recordings (only from `resolvePlayback` after the ticket check).
- Ticket codes are 10 chars of crypto-random (`randomBytes`) over a 31-symbol
  alphabet (~49.6 bits), so brute-forcing a valid code through the throttled
  play endpoint (30 / 60s) is infeasible.
- Upload content types were widened to `video/*` behind the existing presign
  size cap (`MAX_UPLOAD_BYTES`, default 8 MB) and signed content-length gate.

Live engagement
- Q&A moderation (`markQuestionAnswered`, `setQuestionHidden`,
  `listQuestionsForOrganizer`) re-derives the event from the question itself and
  calls `assertEventOrganizer(userId, question.channel.eventId)`. Because the
  authorization is anchored on the question's real event, an organizer of one
  event cannot moderate another event's questions by manipulating the URL
  `:orgId`/`:eventId`. No cross-event IDOR.
- The moderation controller is `@UseGuards(AuthGuard('jwt'), RolesGuard)` with
  `@Roles('owner','admin','organizer')`, so unauthenticated or attendee tokens
  are rejected at the guard before the service check.

Cross-cutting
- No hardcoded secrets, tokens, or keys in the new modules.
- No `dangerouslySetInnerHTML` anywhere in the web app. Feedback comments, poll
  and question bodies, discount codes, and recording titles render through React
  escaping. Recording URLs use `@IsUrl` (rejects `javascript:` and `data:`), and
  the watch page only ever builds YouTube/Vimeo embed URLs or a native
  `<video src>`, both as React-escaped attributes. No stored XSS.
- No server-side fetch of recording link URLs, so no SSRF from the recording
  source field.
- The new work did not modify any core-security file (auth, cookies, CSRF, CORS,
  CSP, helmet, throttler, JWT, main bootstrap). Existing guards are intact.

## Recommended follow-ups

1. R-1: move uploaded recordings to a private bucket with signed, short-lived
   GET URLs before recordings back paid tiers. Sizing: small (one storage
   method plus one line in `playbackUrlFor`).
2. Run `pnpm security:all` in CI on this branch for the dynamic layer (ZAP
   baseline, dependency CVE, secret scan) that this static pass did not cover.
3. Optional: add the discount validate endpoint and recording play endpoint to
   the api-authz abuse-test suite (`security/`) so the tenancy and gating checks
   are covered by the automated BOLA/IDOR harness going forward.
