# Orkora - Launch Readiness Plan

Target for this plan:
- Launch shape: private beta (a handful of trusted organizers, hand-onboarded).
- Scale: medium (hundreds of events, occasional spikes on popular on-sales).
- Markets: pan-African (multi-currency; Flutterwave for XAF/XOF; multiple data-protection regimes).

How to read this. Stages are ordered by dependency. Each item is tagged:
- [BETA] must be done before real organizers and real money touch the system.
- [SCALE] needed before opening past the private beta / going public.
- [FOLLOW] fast-follow that can happen during the beta.

The [BETA] items are the launch gate. Everything else is sequenced after.

Current foundation already in place (so we are not starting from zero): JWT/OTP auth, orgs + RBAC, events/tiers/sessions, registration + QR tickets + check-in, Stripe + Paystack live with verify-on-return settlement, webhook idempotency ledger, order-hold TTL cron, refunds (endpoint/UI, not yet live-tested), super admin console, API keys + public API, Postmark email, Cloudflare R2 uploads, Sentry + CSP reporting, rate-limit guard, audit log, Redis/BullMQ, green CI.

---

## Stage 0 - Environments, observability, backups

Goal: be able to test safely off-prod, see failures fast, and prove you can recover data.

- [BETA] Stand up a staging environment: separate Neon database branch, separate Render service, Vercel preview, separate provider test keys. Stop testing against production (we have been creating/unpublishing test events in prod).
- [BETA] Confirm Sentry is actually capturing in production for both API and web (throw a test error in each, see it land); set release/source-map upload so stack traces are readable.
- [BETA] Uptime + health alerting: external monitor (UptimeRobot/BetterStack) on `/health`, alert to email/Slack. Add a synthetic check that hits a real public event page.
- [BETA] Backups + restore drill: confirm Neon point-in-time-recovery retention; perform one real restore into staging and time it. Write down RPO (acceptable data loss) and RTO (time to restore).
- [FOLLOW] Centralize logs with retention (pino is already structured); make them searchable.

Exit: you can deploy to staging, errors and downtime page you, and you have personally restored the database once.

---

## Stage 1 - Data and schema safety

Goal: schema changes can never silently lose production data, and tenants can never see each other's data.

- [BETA] Replace `prisma db push` for production with a reviewed migration workflow. `db push` infers diffs and can drop columns/tables without warning; that is fine for a fresh dev DB, dangerous for prod. Adopt `prisma migrate` (forward-only) or hand-reviewed SQL migrations, applied via a runbook that snapshots first.
- [BETA] Migration runbook: backup -> apply to staging -> verify -> apply to prod -> verify. No ad-hoc schema edits against prod.
- [BETA] Tenancy isolation audit: this is the top multi-tenant risk. Verify every query (including the raw `$queryRawUnsafe` analytics/attendee rollups) is org-scoped, the RolesGuard org resolution is correct, and the superadmin bypass is the only intended cross-org path. Add automated tests that prove org A cannot read/modify org B's events, registrations, orders, tickets, members, and API keys.
- [FOLLOW] Consider Postgres row-level security as defense-in-depth behind the app-level checks.

Exit: a schema change can be shipped through a documented, reversible path; tenancy isolation is covered by passing tests.

---

## Stage 2 - Payments integrity and money correctness

Goal: every charge, refund, and currency is exactly right, and local state always reconciles with the providers.

- [BETA] Currency/minor-unit audit across all three providers. NGN and USD are 2-decimal, but several pan-African currencies (XAF, XOF) are zero-decimal. Confirm how `amountMinor` is stored and converted per provider per currency so a 1,000 XAF charge is never sent as 100,000. Add unit tests per currency x provider.
- [BETA] Live-test refunds end to end on Stripe and Paystack (endpoint + UI exist but were never exercised against a real transaction).
- [BETA] Configure and verify provider webhooks in production for every enabled provider (verify-on-return is the backup, not the primary). Confirm signature verification and the `webhook_events` idempotency ledger under duplicate deliveries.
- [BETA] Reconciliation job: scheduled compare of provider transactions vs local orders; alert on any drift (paid-at-provider but pending locally, or vice versa).
- [BETA] Receipts: issue a receipt/confirmation per paid order (organizers taking money need this; attendees expect it).
- [SCALE] Wire and live-test Flutterwave for XAF/XOF (code exists, keys not set). Required for the pan-African goal but only when you onboard a francophone-market organizer.
- [FOLLOW] Dispute/chargeback handling basics; payout/settlement timing documented per provider.

Exit: refunds work, all target currencies are provably correct, webhooks are live and idempotent, reconciliation runs clean, receipts are issued.

---

## Stage 3 - Security hardening

Goal: pass an OWASP-top-10 style review with no criticals; abuse is contained.

- [BETA] Auth review: refresh-token rotation + revocation on logout/compromise, OTP brute-force lockout and per-destination rate limits, JWT signing-key rotation plan, session-fixation checks.
- [BETA] Rate limiting tuned on the hot/abusable paths: OTP send, login, public registration, checkout creation, public API. (Throttler guard exists; set real limits.)
- [BETA] Secrets: confirm none are committed, rotate the launch set (rotation script exists), document where each lives. Lock down CORS to known origins.
- [BETA] Input/file validation coverage: confirm zod/class-validator on every public input; validate R2 upload content-type/size; sanitize anything rendered.
- [BETA] Move CSP from report-only to enforce once the report stream is clean.
- [SCALE] Automated dependency + container scanning in CI (Dependabot/npm audit/Trivy); triage criticals.
- [FOLLOW] Lightweight external pen test or a structured self-assessment before public launch.

Exit: security checklist signed off; scanners show no unaddressed criticals; abuse controls verified.

---

## Stage 4 - Performance and scale (medium)

Goal: hold up under hundreds of events and a popular on-sale spike without falling over.

- [BETA] Kill cold starts: move the API off any spin-down tier onto an always-on Render instance (cold starts already bit us hitting the API). Cheap, high impact for beta credibility.
- [BETA] Database index audit for the real query patterns (event by code/slug, registrations/attendees/analytics rollups, ticket inventory). Add missing indexes; review for N+1.
- [SCALE] Connection pooling: use the Neon pooler and set Prisma connection limits sized for concurrency.
- [SCALE] Caching (Redis is already present): cache hot public reads (event pages, payment methods) with sane invalidation on publish/update.
- [SCALE] Concurrency-test the ticket on-sale path. The `SELECT ... FOR UPDATE` inventory lock is the right pattern; prove it holds under a simulated flash-sale (k6/Artillery) with no oversell and acceptable latency.
- [SCALE] Multi-instance readiness: confirm the API is stateless and add the socket.io Redis adapter before running more than one instance (live features need it).

Exit: a load test at your medium target passes with no oversell, p95 latency within budget, and no cold starts.

---

## Stage 5 - Reliability and operations

Goal: detect, respond to, and roll back incidents quickly; organizers have a support path.

- [BETA] Runbooks: incident response, deploy + rollback (Render and Vercel both support instant rollback), database restore, secret rotation, and an on-sale "war room" checklist.
- [BETA] Alert routing: Sentry + uptime + payment-reconciliation alerts into one channel (Slack/email).
- [BETA] Support tooling in the super admin console: look up an order/registration, resend a ticket, issue a manual refund, and audited support actions. Beta organizers will email you; you need to act fast.
- [FOLLOW] Status page (even a simple hosted one) for beta organizers.
- [FOLLOW] Feature flags for risky changes so you can dark-launch and kill-switch.

Exit: you can go from alert to mitigation to rollback within target, and you can resolve a typical organizer support request from the console.

---

## Stage 6 - Compliance and legal (taking money + PII, pan-African)

Goal: legally able to take payments and hold attendee data across your launch markets.

- [BETA] Legal pages live and linked: Terms of Service, Privacy Policy, Refund/Cancellation policy, and an Organizer Agreement. You cannot take third-party money without these.
- [BETA] Data-protection baseline: Nigeria NDPR to start (privacy notice, lawful basis, consent where needed, data-subject export/delete flow, breach process). Confirm the Neon data region and document it.
- [BETA] PCI posture: you use providers' hosted checkout pages (card data never touches Orkora), which keeps you at SAQ-A, the lightest burden. Document this and keep card entry on provider pages (already the case).
- [BETA] Email compliance: SPF/DKIM/DMARC aligned for the Postmark sending domain (improves deliverability and is expected); unsubscribe handling for any non-transactional mail.
- [SCALE] Extend data-protection coverage as you enter each market: POPIA (South Africa), Ghana DPA, Kenya DPA. Pan-African is multi-regime, handle per market as you onboard.
- [FOLLOW] Tax/receipt requirements per market (VAT where applicable).

Exit: legal pages published, NDPR baseline + data-subject rights in place, email domain authenticated, PCI posture documented.

---

## Stage 7 - Beta launch gate and dry run

Goal: prove the whole thing on production before handing keys to real organizers.

- [BETA] Full production dry run with a throwaway org: create org -> event -> tiers -> publish -> register -> pay on each enabled provider -> refund -> check in a ticket. All green, with emails received.
- [BETA] Email deliverability spot check across Gmail/Outlook/Yahoo (not just one inbox).
- [BETA] Onboarding kit for the hand-picked organizers: a short setup guide, a direct support channel, and clear expectations (it is a beta).
- [BETA] Launch checklist sign-off: backups verified, monitoring + alerts live, rollback plan ready, on-call (even just you) defined.
- [FOLLOW] Define beta success metrics and a structured feedback loop from the first organizers.

Exit: dry run is green end to end on prod; first organizers onboarded with a support path.

---

## Suggested sequencing

1. Stage 0 + Stage 1 first (you cannot safely harden anything while testing in prod with an unsafe migration path).
2. Stage 2 + Stage 3 in parallel (payments and security are the core trust surface).
3. Stage 6 alongside the above (legal pages and NDPR are not engineering-blocked; start them early).
4. Stage 4 (the [BETA] subset: no cold starts + indexes) before the dry run; the [SCALE] subset before going public.
5. Stage 5 lightweight for beta, matured before public.
6. Stage 7 is the gate.

The fastest path to a defensible private beta is: staging + observability + backups (0), safe migrations + tenancy tests (1), payments correctness + refund/webhook/reconciliation (2), core auth/rate-limit/secrets (3), legal pages + NDPR baseline (6), no-cold-start + indexes (4 subset), and the dry run (7). Flutterwave, full scale work, deep ops, and multi-country compliance are the natural fast-follows.
