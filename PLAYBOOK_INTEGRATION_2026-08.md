# SaaS playbook integration: what applies to Orkora, what does not

Assessment of the "Scaling and Securing SaaS Platforms" playbook against the
actual Orkora codebase, on 2026-08-25. Read with `SECURITY_AUDIT_2026-08.md`
(which already closed most of the playbook's security surface) and
`OUTSTANDING.md`.

**Headline: three of the playbook's four sections describe controls Orkora
already has, in most cases built further than the playbook goes. The one real
hole was in a place the playbook does not look: signature verification was
correct, but nothing compared the amount captured against the amount owed.
That is fixed in this change set. The remaining genuine gaps are reliability
measurement and cost duty-cycle, both smaller than the playbook implies.**

---

## Section 1: Webhook security

### Already in place, verified in code

| Playbook directive | Orkora | Where |
|---|---|---|
| Verify the signature | Done, per provider, with `timingSafeEqual` on Paystack and Flutterwave and `Stripe.webhooks.constructEvent` on Stripe. Raw body captured via `rawBody: true` in `main.ts` so the HMAC is computed over the bytes that were signed. Missing header is a 401 before any parsing. | `payments.controller.ts`, `providers/*.provider.ts` |
| Enforce idempotency | Done at two layers. `webhook_events` has `unique (provider, provider_event_id)`; a duplicate delivery is caught on the insert (P2002) and acked without side effects. The order state machine is independently idempotent. | `payments.service.ts` `handleWebhook`, migration `2026-04-28-add-webhook-events.sql` |
| Restrict URL access by IP | Not done, and **recommended against**. See below. |  |

### The gap the playbook misses, now closed

A verified signature proves the message came from the provider. It proves
nothing about the figure inside it. Before this change, every settlement path
(`handleWebhook`, verify-on-return `settleOrder`, the reconciliation sweep)
read `status` and nothing else. `WebhookOutcome.paid` did not even carry an
amount, so there was nothing to compare.

Flutterwave's own integration guidance is explicit that `status`, `amount`,
`currency` and `tx_ref` must all be matched against your record before value is
given. Orkora matched `status`.

Three ways that bites, in rising order of likelihood:

1. A capture in a different currency than the order. `500000` charged in USD
   against an NGN order settles a roughly 1,500x underpayment at face value.
2. A short capture. Any provider path that lets the payer influence the amount
   while keeping the reference (Flutterwave `tx_ref` is our order id) settles a
   full-value ticket.
3. **Our own drift, which needs no attacker.** An order's `total_minor` can
   change between checkout-mint and settlement if a discount slot is released
   in between. Nothing detected that. This is the case most likely to have
   already happened.

**Fixed.** `verifySettlementAmount` now runs before any state flip:

- captured currency differs -> quarantine, no tickets, no receipt
- captured < order total -> quarantine
- captured > order total -> settle anyway, audit the excess for a finance refund
- exact -> settle

Quarantine keeps the order `pending` (so no existing status consumer changes
behaviour) and stamps `orders.settlement_hold_at / _reason / _detail`
(migration `0016`). `releaseStaleHolds` skips held orders, so a quarantined
order is never expired and its inventory never released while the customer's
money sits with the provider. A later, correct settlement clears the hold.

Asymmetry is deliberate: an underpayer gets nothing, an overpayer gets their
ticket and finance gets an audit row. Withholding a ticket from someone who
paid too much is the wrong failure mode.

### Why not IP-allowlist the webhook endpoint

The playbook's third directive is the one to skip. Orkora already has
signature verification, an idempotency ledger, verify-on-return, and a
30-minute reconciliation sweep. An IP allowlist adds no attack coverage on top
of a valid HMAC, and it adds a new outage mode: three providers across four
currencies, each rotating egress ranges on their own schedule, with a stale
entry presenting as silent payment failure rather than a loud error. Render
also has no request-level WAF layer to put it in, so it would live in
application code and be maintained by hand.

Decision: **do not implement.** Revisit only if a provider publishes a stable,
documented CIDR list with a change-notification channel.

### Open item to verify, not fixed here

`[Likely]` Flutterwave's current webhook documentation describes a
`flutterwave-signature` header carrying an HMAC-SHA256 of the payload. Orkora
reads the legacy `verif-hash` header and does a constant-time compare against a
static secret. A static shared secret in a header is the weakest of the three
provider schemes: it is a bearer token, identical on every event, with no
timestamp and therefore no replay window at all.

Action: confirm which scheme your Flutterwave account is actually sending, and
if HMAC is available, move to it. Until then the exposure is bounded by
`webhook_events` retention, which is currently unbounded (nothing prunes it),
so replay is blocked indefinitely. Do not add a retention policy to that table
without first moving Flutterwave to a signed scheme.

`[Certain]` `PAYSTACK_WEBHOOK_SECRET` is declared in `render.yaml` but never
read. Paystack signs with the secret key, which is what `paystack.provider.ts`
uses. Remove the dead env var so nobody rotates it expecting an effect.

---

## Section 2: Error budgets

The playbook is directionally right and operationally wrong for a team this
size. "If you exceed the budget, all feature development must stop" is a
policy for an org with a dedicated SRE function and a feature pipeline deep
enough to pause. Adopting it verbatim here would produce a rule that gets
broken the first time it fires, and a broken rule is worse than none.

What is worth taking: **pick the handful of paths where failure costs money,
put a number on them, and alert on the rate rather than on individual errors.**

### Orkora already has the data

This is the part worth knowing before building anything. An error budget needs
a denominator, and Orkora already writes one:

- `webhook_events` records every settlement signal with its `outcome`
- `orders` records every attempt, its status, and now its settlement holds
- `audit_events` records refunds and, now, settlement mismatches

The payment error budget is a SQL query over tables that already exist. It does
not need a metrics endpoint, a Prometheus scrape, or a time-series database.
Note that `main.ts` excludes `metrics` from the global prefix for a route that
does not exist; either build it or drop the exclusion.

### The four paths worth a budget

Scoped to what actually costs money or a customer:

| Path | Failure means | Suggested budget |
|---|---|---|
| `POST /v1/payments/webhook/:provider` | a paid order does not settle | non-2xx rate over 30 days |
| `POST /v1/payments/orders/:orderId/checkout` | buyer cannot pay at all | 5xx rate over 30 days |
| `POST /v1/payments/orders/:orderId/verify` | buyer paid, sees no ticket | 5xx rate over 30 days |
| `POST /v1/auth/login` | nobody gets in | 5xx rate over 30 days |

Deliberately excluded: discovery pages, analytics, the dashboard. They can fail
for an hour without costing a naira, and putting them in the budget dilutes it.

### Three signals to build, in order of value

1. **Settlement drift alert.** `reconcilePendingPayments` already returns
   `recoveredPaid`, `markedFailed`, `stillPending` and now `held`. Any
   `recoveredPaid > 0` means a webhook was missed and the customer waited. Any
   `held > 0` means money is stuck. Both currently only reach the log. Route
   them to a real alert. **This is the highest-value item in Section 2 and it
   is roughly an afternoon.**
2. **Burn rate on the four paths.** A daily job that computes the 30-day
   rolling failure rate per path and alerts when the projected month-end spend
   exceeds the budget. The playbook's "burn rate" idea, at the scale Orkora
   actually operates.
3. **Cost of failure.** The playbook says to quantify outages in revenue. You
   can do this exactly, unlike most teams: `orders` has amounts and timestamps,
   so revenue-per-minute during any window is a query. Worth wiring once so
   reliability arguments carry a number.

### Decision to lock before building

What happens when a budget is exhausted. The honest options are (a) a named
person owns reliability until it recovers, (b) the next sprint's first item is
the fix, or (c) nothing formal, the alert is the whole mechanism. Pick one now.
Do not adopt "stop all feature development" unless you intend to honour it.

---

## Section 3: Infrastructure cost

The playbook's three directives map badly onto Orkora's actual topology. Taken
literally, two of them are inapplicable and the third is already done.

| Playbook directive | Reality for Orkora |
|---|---|
| Scale to zero when users are asleep | `[Certain]` Render does not offer scale-to-zero on a Starter web service, and the API must be always-on regardless: provider webhooks arrive at any hour and a cold API means a missed settlement. Inapplicable to the main compute. |
| Hard spending caps at every layer | `[Certain]` Render's pricing page documents no hard spend cap. Vercel and Neon offer spend controls; Render's exposure is bounded a different way, by the fact that a Starter instance is a fixed $7/month and does not autoscale. The real uncapped surfaces are Neon compute, R2 egress and Postmark volume. |
| Right-size the database | Neon is consumption-billed, so the lever is not instance size but **duty cycle**, which is already partly handled. |

### The one cost finding that is real, and it is already half-fixed

Someone already found the highest-value item in this section. `stale-hold.cron.ts`
carries this comment:

> Interval is env-tunable via STALE_HOLD_CRON; default every 15 minutes. It was
> every minute, which meant this query hit Postgres 24/7 and kept Neon compute
> from ever scaling to zero (the main driver of idle DB cost).

Correct diagnosis, incomplete fix. Two crons still poll Postgres unconditionally:
stale-hold every 15 minutes and reconciliation every 30. Neon's autosuspend
cannot fire while something wakes the compute four times an hour, every hour,
whether or not a single order exists. On an idle night the database is awake for
a meaningful fraction of the time doing nothing.

Three ways to finish it, cheapest first:

1. **Gate the sweeps on a Redis flag.** Redis is already provisioned. Set a key
   when an order enters `pending`; the cron reads Redis and skips the Postgres
   round trip entirely when the key is absent. An idle Orkora then never wakes
   Neon. This is the real fix and it is small.
2. **Align the two crons to the same minute** so they wake compute once instead
   of twice. One line, partial benefit, do it anyway.
3. **Widen stale-hold to the order TTL.** `ORDER_HOLD_TTL_MIN` is 20 and the
   sweep runs every 15; there is no reason for the sweep to be tighter than the
   thing it sweeps.

### Caps worth setting, specific to this stack

- **Neon**: confirm autosuspend is enabled and set a compute-hours alert. This
  is the only database lever that matters on consumption billing.
- **Postmark**: a per-month send cap. Every paid order sends a ticket email and
  a receipt; a retry loop in a settlement path is the plausible runaway.
- **Cloudflare R2**: `MAX_UPLOAD_BYTES` is set at 8 MiB server-side, which caps
  per-object ingest. Egress is the uncapped side; put an alert on it.
- **Vercel**: a spend cap on the web project. The `/city/[slug]` revalidate was
  lowered from 3600 to 300 seconds for discovery freshness, which is a 12x
  increase in origin fetches on those pages. Worth watching, not reverting.
- **Render**: `[Certain]` Free Key Value is 25 MB. Rate-limit state on a free
  tier with `allkeys-lru` will silently evict under load rather than error,
  which degrades rate limiting invisibly. Know that before it matters.

### Discrepancy to resolve

`render.yaml` provisions `orkora-redis` as a Render Key Value service and wires
`REDIS_URL` from it. The session handoff says Redis is on Upstash. One of these
is stale. Whichever is true, the other is either an orphaned billed resource or
a stale blueprint. Check the Render dashboard.

---

## Section 4: SSRF

Already built, and built past the playbook. `apps/api/src/common/http/secure-fetch.ts`:

| Playbook directive | Orkora |
|---|---|
| Allowlist permitted domains | Implemented as a **denylist of destinations** rather than an allowlist of domains, which is the stronger form here: https-only scheme check, then DNS resolution with rejection of loopback, link-local, private, CGNAT, unspecified, multicast, reserved, and the IPv6 equivalents including unique-local `fc00::/7`. IPv6 literals are unbracketed before the check. |
| Defend against redirection | Stronger than asked: redirects are refused outright (`redirect: 'manual'`, any 3xx throws) rather than followed-and-revalidated. |
| Standardise error responses | Partial. `SecureFetchError` carries a `reason` discriminator (`private-address`, `dns-fail`, `redirect`, `too-large`). Internal by design, but it needs a caller-side check. |

### The one thing to verify

The module's own docblock states the contract: *"Every place that fetches a URL
we got from a request body, query parameter, or other user input MUST go
through here."* That contract is enforced by convention, not by the compiler.

Two actions:

1. Audit every outbound `fetch(` in `apps/api/src` and confirm each one is
   either a hardcoded vendor host or routed through `secureFetch`. The known
   plain-`fetch` sites are the Paystack and Flutterwave API calls, which are
   hardcoded hosts and correctly exempt.
2. Confirm no `SecureFetchError.reason` reaches an HTTP response body. The
   playbook's point stands: `private-address` and `dns-fail` are different
   answers, and the difference maps the internal network. Any user-facing
   handler must collapse them to one generic message.

An ESLint rule banning bare `fetch(` outside an allowlist of files would make
the convention enforceable. Worth the twenty minutes.

---

## What shipped in this change set

Uncommitted. The user runs `git add/commit/push` and the test suite.

| File | Change |
|---|---|
| `apps/api/migrations/0016_order_settlement_hold.sql` | new: `orders.settlement_hold_at / _reason / _detail` + partial index |
| `schema.sql` | folded 0016 in for fresh installs |
| `apps/api/prisma/schema.prisma` | `Order.settlementHold*` fields + index |
| `payments/money.ts` | `fromSmallestUnit`, `fromMajorUnit` (the inverses the check needs) |
| `payments/providers/types.ts` | `SettledAmount`; required on `WebhookOutcome.paid` and on a `success` `TransactionStatus` |
| `payments/providers/stripe.provider.ts` | extract `amount_total` + `currency` on both paid events and on verify |
| `payments/providers/paystack.provider.ts` | extract `data.amount` + `data.currency` on `charge.success` and on verify |
| `payments/providers/flutterwave.provider.ts` | extract major-unit `amount` + `currency` on `charge.completed` and on verify |
| `payments/payments.service.ts` | `verifySettlementAmount` gate; `markOrderPaid` returns settled/held; hold cleared on correct settlement; stale-hold sweep and reconciliation both skip held orders; `held` count in the reconciliation summary; `resolveSettlementHold` for the console |
| `admin/admin.service.ts` | `listSettlementHolds`; `settlementHolds` count on the console overview |
| `admin/admin.controller.ts` | `GET /v1/admin/settlement-holds`, `POST /v1/admin/settlement-holds/:orderId/resolve` |
| `admin/admin.module.ts` | imports `PaymentsModule` |
| `payments/money.spec.ts` | round-trips for 2, 0 and 3-decimal currencies and major-unit providers |
| `payments/settlement-amount.spec.ts` | new: the four-outcome decision table, no-double-alert, hold clearing, sweep exclusion |
| `payments/providers/settlement-extraction.spec.ts` | new: per-provider amount extraction, including the zero-decimal scaling case |
| `payments/payments.service.spec.ts` | updated for the new `markOrderPaid` signature |

Typechecking and Jest could not run from this session (the workspace
`node_modules` binaries are Windows-linked). All changed files were verified to
parse clean with the TypeScript compiler API, the money conversions were
executed and their round-trips checked against independently derived values,
and the em-dash rule was grepped clean. **The test suite still needs to run in
your environment, and `prisma generate` must run before typecheck will pass,
because the `settlementHold*` fields are new.**

### Deploy order

1. `prisma generate`
2. run the test suite
3. deploy the API (migration `0016` applies on boot via `scripts/migrate.mjs`)

The migration is additive and idempotent; there is no backfill and no downtime
step. Orders already settled are untouched.

---

## Decisions this leaves open

1. **Error budget enforcement.** What actually happens when a budget is blown.
   Pick one of the three options in Section 2 above.
2. **Flutterwave signature scheme.** Confirm `verif-hash` vs
   `flutterwave-signature` on your account, then decide whether to migrate.
3. **Who watches a held order.** The API side is built:
   `GET /v1/admin/settlement-holds` lists them, `settlementHolds` appears on the
   console overview, and `POST /v1/admin/settlement-holds/:orderId/resolve`
   takes `recheck` or `cancel`, both audited with the actor. What remains is a
   `/admin` page in `apps/web` and a named person. Held money with nobody
   watching is worse than the bug it replaced, so pick the person even before
   the page exists; the endpoints work today.

   Note the ordering trap on `cancel`: it fails the order and releases seats
   but moves no money. Refund at the provider first, then cancel.
