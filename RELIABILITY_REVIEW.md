# Reliability Review (Phase 6)

Date: 2026-07-10. Repo: canonical `C:\dev\orkora` (a real git repo; an earlier
pass ran against a now-stale OneDrive copy and its findings were re-verified
here because the two trees have diverged). Method: multi-agent adversarial
review of the workflow-critical API surfaces (auth/tenancy, payments,
registrations, engagement, public API, health, audit), each finding checked
against the source in THIS repo. This is the charter's Phase 6 gap analysis
(`~/.claude/rules/ecc/reliability-charter.md`). Companion to `SECURITY_REVIEW.md`
and `OUTSTANDING.md`.

## What is already solid (verified here, do not re-touch)

These are the scaffold non-negotiables from `CLAUDE.md`, confirmed present in
this repo:

- Structured JSON logging via `nestjs-pino` with redaction (`app.module.ts`).
- Per-request correlation id via pino `genReqId` (honours inbound
  `X-Request-Id`, echoes it, stamps every log line).
- Append-only audit table + `AuditService.record()` (`@Global`, best-effort so
  audit never breaks the business op).
- Webhook idempotency ledger (`webhook_events`, unique on
  `(provider, providerEventId)`).
- Raw-body HMAC verification for all three providers with `timingSafeEqual`.
- Per-tier "last ticket" race serialized with `SELECT ... FOR UPDATE`.
- `ticket-signer` binds the token to `eventId` (no cross-event replay).

Several launch-blockers from the earlier (stale-copy) pass are ALREADY
remediated in this repo and were re-confirmed, not re-changed: the payment
webhook is on the unauthenticated controller (providers can reach it), the
health probe returns 503 when the DB is down, the 500 handler does not leak
internal error text, and the engagement poll create/close path carries an
org-ownership check.

## Fixed this pass (verified: `tsc --noEmit` clean; jest green)

Both are cross-tenant authorization bypasses (IDOR) live in this repo's `HEAD`.

1. **RolesGuard resolved the org id header-first.** The guard authorized against
   `X-Organization-Id ?? :orgId ?? body`, but every controller passes the route
   `@Param('orgId')` to its service. A member of org A could send `header=A`
   (satisfying the guard) to a route whose `:orgId=B`, and the controller would
   then serve org B's data. Fix: resolve **param-first**
   (`:orgId` -> `:organizationId` -> header -> body), so the guard authorizes the
   exact value the controller uses. `apps/api/src/common/guards/roles.guard.ts`.
   Tests: `roles.guard.spec.ts` 13/13, including a new case that the header can
   no longer reach another org.

2. **Public-API events endpoint had no org scope check.** `list`/`get` on
   `PublicApiEventsController` sat behind `JwtOrApiKeyGuard`, which only proves
   the token is valid, not that it is scoped to the route `:orgId`. Any
   logged-in user, or any organization's API key, could read another org's
   events (including drafts, pricing, and `streamUrl`). Fix: `assertCallerInOrg`
   before every read - an API key must be bound to the same `orgId`, a JWT user
   must hold a membership for it, and only a platform superadmin crosses orgs.
   `apps/api/src/modules/events/public-api.controller.ts`. Tests:
   `public-api.controller.spec.ts` 9/9, including cross-tenant JWT, wrong-org
   API key, same-org API key, superadmin, and unauthenticated.

3. **Refund double-fire.** `refundOrder` read `status = 'paid'` and then called
   `provider.refund()` with no local claim in between, so a double-click (or two
   dashboard tabs) fired two real refund requests at the provider. Fix: an
   atomic claim on the existing in-flight marker -
   `updateMany WHERE status='paid' AND refundInitiatedAt IS NULL` before the
   provider call; a concurrent caller matches 0 rows and is rejected, so exactly
   one provider refund is issued. The claim is released (marker back to NULL) if
   the provider declines or the call throws, so a corrected retry is still
   possible; `reconcileRefunds` continues to key on the same marker.
   `apps/api/src/modules/payments/payments.service.ts`. Tests:
   `payments.service.spec.ts` 34/34, including a rejected concurrent second
   refund (provider never called twice), decline-releases-claim, and
   throw-releases-claim.

## Open (candidates being worked down; each re-verified against this repo first)

Concurrency / atomicity:

- **Payment transition atomicity.** `markOrderPaid`/`markOrderFailed` and the
  stale-hold cron should be atomic conditional updates
  (`UPDATE ... WHERE status = 'pending'`) so a late webhook and the cron cannot
  both act.
- **Check-in double-scan.** `checkIn` should claim with
  `WHERE checkedInAt IS NULL` and branch on the affected-row count.
- **Event capacity.** Enforce `Event.capacity` inside the same `FOR UPDATE`
  transaction as the tier check (an unlimited-quantity tier can otherwise
  oversell the venue).
- **Registration double-submit.** The `(eventId, userId)` upsert dedupes the
  registration row but can still append duplicate tickets/orders (needs an
  idempotency key or dedupe window).

Tenant isolation / engagement:

- **WebSocket event-access gate.** Confirm every engagement socket handler
  (`chat:join`, `chat:message`, `poll:vote`, `qa:*`) verifies the socket user is
  a member or registered attendee of `eventId` before joining the room or
  mutating.
- **WS presence never decrements.** Confirm presence counts are released on
  `disconnect`.

Scale landmines (masked by the single-instance deploy today):

- WebSocket gateway needs the Redis adapter before scaling past one instance.
- WS namespace `cors: '*'` should reuse the REST `CORS_ORIGINS` allow-list.
- Prisma pool unsized (`connection_limit`/`pool_timeout`) before first scale.

Audit coverage:

- Grow `AuditService.record()` call sites to every sensitive mutation (money
  lifecycle, role grants, deletions, check-in, poll create/close), threading the
  actor + requestId.

## Remediation order

Cross-tenant IDORs first (done). Then the money/concurrency correctness items
(refund double-fire, payment transition atomicity, check-in, capacity), then the
engagement tenancy + presence fixes, growing audit coverage alongside each. The
scale landmines wait until just before the first multi-instance deploy.
