# Public API Data-Exposure Audit — 2026-07-25

Scope: every HTTP route not behind `AuthGuard('jwt')` (or the composite
`JwtOrApiKeyGuard`). Goal: confirm no unauthenticated endpoint over-returns PII,
secrets, or unneeded internal fields to the client. The API runs under a global
`/v1` prefix (versioning already in place).

## Fixed in this pass

1. **`GET /v1/tickets/by-code/:code` leaked the holder's full email.** This is a
   public bearer-code endpoint (the code is in the URL), so a forwarded or
   leaked ticket link exposed the attendee's full email address. Now the email
   is **masked** on this path (`j***@gmail.com`). The authenticated owner still
   gets the full value from `GET /v1/me/tickets`.
   - File: `registrations.service.ts` (`maskEmail`, `getTicketByCode`).

2. **Public live-engagement reads leaked internal user ids.** The unauthenticated
   chat (`GET .../engagement/chat`) and Q&A (`GET .../engagement/questions`)
   responses included each author's internal `user.id` (a stable identifier
   across events). Anonymous viewers only need the display name and avatar, so
   `user.id` was removed from these two public serializers. The authenticated
   organiser Q&A view (`listQuestionsForOrganizer`) is unchanged.
   - File: `engagement.service.ts` (`listMessages`, `listQuestions`).

## Reviewed and accepted (no change needed)

- **Ticket QR token on the bearer endpoint.** `getTicketByCode` returns the
  signed `qrToken` so the ticket page can render the QR. Acceptable: ticket
  codes are 10 chars of crypto-random over a 31-symbol alphabet (~8×10^14
  combinations), so the code is a strong bearer credential.
- **`GET /v1/payments/orders/:orderId`.** Soft-public by order id (a uuid the
  buyer holds). Returns order status, holder names, ticket codes, tier names —
  no email, no provider secrets. Acceptable for the post-checkout return flow.
- **Public event / brand reads** (`findPublicByCode`, `findPublicBySlug`,
  `getPublicBrand`). IDs are uuidv7 (non-enumerable); content is org-authored
  (titles, speaker bios, socials). No attendee PII.
- **Payment provider webhook** (`POST /v1/payments/webhook/:provider`). No guard
  class, but authenticity is enforced by per-provider signature verification on
  the raw body inside the handler.
- **`GET /v1/me/unsubscribe`.** Authenticated by an HMAC in the `s` query param.
- **Ticket share** (`getTicketShare`) already excludes `qrToken` and check-in
  data by design.

## Recommended follow-ups (not changed here)

- **Postmark webhook guard fails open.** `PostmarkAuthGuard` admits the request
  (with a warning log) if `POSTMARK_WEBHOOK_TOKEN` is unset. Ensure the token is
  set in production and consider making the guard fail closed once rotation is
  complete.
- **Contract tests for public shapes.** Add response-shape assertions for the
  public endpoints so a future `include`/`select` change can't silently
  re-introduce an over-return. This is the durable guard the "treat your API as
  a product" principle calls for.
