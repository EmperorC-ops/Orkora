# Orkora Build History

How the platform was built, stage by stage, with what changed in the backend and frontend, what broke, and why. Pair this with the root [`README.md`](../README.md), which describes the system as it stands today.

**Sources:** git history (236 commits, `e92a99d` on 6 May 2026 to `28d5ce8` on 22 October 2026), the documents in the repository root, and the code. Commit hashes are given so you can read the exact change (`git show <hash>`). Anything that could not be confirmed from these sources is marked **(unverified)**.

**Last updated:** 23 October 2026.

---

## Contents

- [Timeline at a glance](#timeline-at-a-glance)
- [Stage 0: Blueprint and initial build (before 6 May 2026)](#stage-0-blueprint-and-initial-build-before-6-may-2026)
- [Stage 1: First deploy and a green pipeline (10 to 25 May)](#stage-1-first-deploy-and-a-green-pipeline-10-to-25-may)
- [Stage 2: Payments you can trust (23 to 25 May)](#stage-2-payments-you-can-trust-23-to-25-may)
- [Stage 3: Launch readiness (27 May to 10 June)](#stage-3-launch-readiness-27-may-to-10-june)
- [Stage 4: Campaigns, billing and auth hardening (28 June to 22 July)](#stage-4-campaigns-billing-and-auth-hardening-28-june-to-22-july)
- [Stage 5: Feature expansion (23 to 26 July)](#stage-5-feature-expansion-23-to-26-july)
- [Stage 6: Discovery, pricing, security audit and idle cost (29 July to 22 September)](#stage-6-discovery-pricing-security-audit-and-idle-cost-29-july-to-22-september)
- [Stage 7: Organizer depth (22 to 30 September)](#stage-7-organizer-depth-22-to-30-september)
- [Stage 8: Platform fee and connected accounts (26 September to 7 October)](#stage-8-platform-fee-and-connected-accounts-26-september-to-7-october)
- [Stage 9: First large live event, WMXKED (3 to 23 October)](#stage-9-first-large-live-event-wmxked-3-to-23-october)
- [Incident and fix register](#incident-and-fix-register)
- [Decisions log](#decisions-log)
- [Lessons that became rules](#lessons-that-became-rules)

---

## Timeline at a glance

| Stage | Dates (2026) | Theme | Headline result |
|---|---|---|---|
| 0 | before 6 May | Blueprint and initial build | Phases 1 to 9 of the blueprint in one monorepo |
| 1 | 10 to 25 May | First deploy, CI | API on Render, web on Vercel, CI green for the first time |
| 2 | 23 to 25 May | Payments reliability | Verify-on-return, reconciliation, refunds; Paystack and Stripe verified live |
| 3 | 27 May to 10 June | Launch readiness | Legal drafts, security harness, PWA, brand, move to Neon, restore drill |
| 4 | 28 June to 22 July | Campaigns, billing, auth | Email campaigns, billing dashboard, CSP fix, cookie and signup fixes |
| 5 | 23 to 26 July | Feature expansion | Discounts, recordings, live engagement, check-in, share cards, Brand Home, Story Mode |
| 6 | 29 July to 22 September | Discovery, audit, cost | Discovery pages, pricing, cross-tenant security fixes, Neon idle savings, settlement hold |
| 7 | 22 to 30 September | Organizer depth | Custom registration questions, VIP links, tier editing, venue reveal, live second screen |
| 8 | 26 September to 7 October | Platform fee | Fee schedule, connected accounts, Paystack and Flutterwave splits; Stripe dropped |
| 9 | 3 to 23 October | First large live event | Outage recovery, roster check-in, PWA prompts, campaign upgrades, invite fixes, admin tools |

---

## Stage 0: Blueprint and initial build (before 6 May 2026)

The project began from `EVENTAPP_BLUEPRINT.md`, a full architecture and build plan for a multi-tenant event platform for African and global markets. The first commit (`e92a99d`, 6 May 2026) already held a working monorepo. The repository does not record how long this stage took.

The original README described nine phases delivered at that point:

| Phase | Delivered |
|---|---|
| 1. Identity and auth | Email and password, Apple and Google sign-in with verified JWKs, OTP over Postmark and Termii, refresh token in an httpOnly cookie, per-user rate limiting, request-id correlation |
| 2. Event builder | Organizer dashboard; create, publish, unpublish and archive events; banner upload; tracks, sessions, speakers and ticket tiers; public event page with agenda |
| 3. Tickets and payments | Stripe, Paystack and Flutterwave behind a provider registry; provider preference per org and currency; signed QR ticket tokens; webhook idempotency ledger; refund initiation |
| 4. Mobile attendee app | Expo and expo-router: register, ticket and event home flows; EAS profiles |
| 5. Check-in | Dashboard scanner, signed-token verification, per-event stats |
| 6. Engagement | Chat, polls and upvotes over a Socket.IO gateway; public live page |
| 7. Analytics | Org dashboards, 12-month trend, conversion funnel, per-event breakdown, audit log |
| 8. Streaming start | `session.streamUrl` drives a "Join live" call to action during the session |
| 9. Hardening | Sentry, CSP with report-uri, helmet, audit log, API keys with scopes (`JwtOrApiKeyGuard`) |

**Planned compared with what was built:** the blueprint planned AWS (ECS Fargate, RDS, ElastiCache, S3, CloudFront) using Terraform. Production instead runs on Render (API), Vercel (web), Neon (Postgres) and Cloudflare R2 (storage). `infra/terraform/` and `deploy-api.yml` are leftovers from the AWS plan.

---

## Stage 1: First deploy and a green pipeline (10 to 25 May)

**Goal:** get the monorepo building and deploying on real hosting.

**Backend**
- Render builds needed several fixes to package a pnpm workspace into Docker: add the `pg` driver (`9e875c6`), bundle runtime dependencies with `pnpm deploy` (`174872e`), regenerate Prisma Client inside the deploy folder (`6704bba`), pin pnpm 10 to match the lockfile (`b79b215`), and enable `inject-workspace-packages` (`1dd1b9c`, `73557e4`, `5fafad3`).
- Postmark wired to `EMAIL_FROM_ADDRESS`, plus the `LOG_OTP_TO_CONSOLE` break-glass for development (`99c898b`).
- Organization creation made idempotent: it returns the existing owned org, and a unique-constraint conflict becomes a 400 rather than a 500 (`4ba3e20`).
- Platform super admin role and console added: orgs, users, events, suspend, promote (`b5acb1f`).
- Liveness and readiness health endpoints split, with a guarded Sentry self-test (`9348a48`).

**Frontend**
- Vercel build fixes: skip type and lint errors during the build (`bba774f`, still in effect today), wrap `useSearchParams` in `Suspense` on the OTP page (`b7dd319`), move `vercel.json` into `apps/web` so Vercel's Root Directory resolves Next.js (`0922e75`).
- An onboarding gate for users with no organization, and the refresh cookie fixed to work cross-site (`892401e`, `55faee9`).
- Event times rendered in the event's own timezone, and `datetime-local` inputs interpreted in that timezone (`9ed7663`, `794526b`). The same change restored ticket helpers whose loss had caused a 500 on registration.
- Light-themed form inputs given an explicit text colour; typing had been white on white (`cfe554e`).

**CI:** red on every push for many separate reasons, listed in `SESSION_HANDOFF.md`. The biggest was that Prisma Client was not generated in CI, which produced about 200 typecheck errors. Others: a duplicated block in `@orkora/contracts`, TS6059 `rootDir` errors in `ui` and `sdk`, a `typedRoutes` cast, a stale test, and the mobile `expo export` build. The first fully green run was at `463aec0` (25 May). Adding a Prisma `postinstall` then broke the Docker dependencies stage and was reverted (`6e3449b`).

---

## Stage 2: Payments you can trust (23 to 25 May)

**Problem:** a paid order settled only when the provider's webhook arrived. A late or missed webhook left a buyer who had paid without a ticket.

**Backend**
- **Verify-on-return:** when the buyer comes back to `/r/<id>/...`, the API asks the provider directly and settles the order. Built for Paystack first (`91a3be3`), then Stripe and Flutterwave (`4455488`).
- **Reconciliation sweep** for stale holds, verifying with the provider before failing an order, plus per-order receipts (`59a3b8a`).
- **Reliable refund settlement:** verify on action, refund reconciliation, a manual re-check, and a refund receipt email that had been missing (`9745957`).
- **Currency-aware amounts,** safe for zero-decimal currencies such as XAF and XOF, and a public webhook route (`ffeb900`).
- **Checkout provider** chosen from the organization's preference, so the client cannot force a provider (`b615436`).
- **Stripe API version pinned** to `2024-04-10` (`2d07639`). A newer version string was invalid for the installed SDK and blocked every Stripe call.

**Result:** Stripe (USD) and Paystack (NGN) both verified live end to end on 25 May (`SESSION_HANDOFF.md`).

---

## Stage 3: Launch readiness (27 May to 10 June)

**Backend**
- Hot-path database indexes (migration `0002`) (`b5b34f7`).
- Security pass: parameterized tenancy SQL and per-account exponential backoff on login (`1ed7f65`); stop leaking raw errors and move signup credentials off the URL (`a8acf5e`); tie tickets to orders, void them on refund, and make the refund email idempotent (`3c60408`).
- Six pre-public-launch security follow-ups (`fd5260f`): CSRF on refresh, JWT key-rotation overlap, signup non-enumeration, a weekly dependency scan and CSP enforcement (details in `SECURITY_REVIEW_2026-05-30.md` section 16).
- An automated security audit harness covering dependencies, secrets, bundle, transport, API authorization and ZAP (`dfcce91`).
- **Database moved from Render Postgres to Neon** (`5290173`). A Neon point-in-time restore drill passed on 3 June (`f8006a3`, `docs/dr/`).

**Frontend**
- Legal pages and an NDPR baseline (`b5b34f7`), then full counsel-ready drafts of the Terms, Privacy, Refunds and Organizer Agreement (`fdbf88d`).
- Marketing site: hero, trust strip, `/pricing`, a live dashboard mock (`4812d35`, `ca2736f`).
- **PWA:** installable on every device, with a service worker caching the ticket QR for offline use (`39e8425`, `8187b32`).
- Domain switched from `orkora.io` to `orkora.events` (`84f32a6`).
- Brand lockup across web, mobile, email, favicons and OG images (`0763820`), redesigned in late June as a vector mark (`bb5a082`, `49252e0`).
- A staging scaffold and smoke harness (`774d374`, `docs/staging/STAGING.md`).

**Incidents:** bulk edits to brand and legal files twice truncated the ends of files. In one case a NUL byte cut a file short (`9b94ee6`, `8abae15`, `ce13b31`). These were repaired by restoring the lost tails.

---

## Stage 4: Campaigns, billing and auth hardening (28 June to 22 July)

**Backend**
- **Campaigns, slice A:** audience email over Postmark (`597caac`), followed by a Basic-Auth guard on the Postmark webhook and a daily send cap per organization (`b346881`).
- Billing dashboard data: lifetime revenue and the notional platform fee (`597caac`).
- Legal entity registered as Orkora Technologies Limited (`02d35fe`).

**Frontend**
- **CSP nonce never applied in production** (`394382e`): client-side JavaScript was blocked, so interactive pages did not work. Fixed by making the per-request nonce actually reach the scripts.
- Credentials kept out of URLs and auth flows hardened (`edb6ed6`).
- **Auth cookies scoped to `.orkora.events`,** with the CSRF cookie at `Path=/` so returning browsers can read it, plus self-healing when a refresh fails (`e1a6096`). Before this, returning users could be stuck with a dead session.
- **Signup** now creates the account through `/auth/signup` and issues the session through `/auth/otp/exchange` (`2e4f4b9`). Previously new users reached the dashboard holding a `Bearer undefined` token.
- After creating an organization, the dashboard calls `refreshSession()` so the new membership is in the token (`24099cd`). The same class of bug resurfaced in stage 9 with invites.
- A real, scannable QR code on web tickets (`4694787`).
- A synthetic login-page check every 30 minutes and after each deploy (`8445506`), later relaxed to every 6 hours (`175d750`).

---

## Stage 5: Feature expansion (23 to 26 July)

A short, dense run of product work.

| Feature | Commits | Notes |
|---|---|---|
| Inline editing of speakers, sessions and tracks; universal button feedback ("Saved", "Copied") | `33788b5`, `5ed715d` | `ActionButton` and `CopyButton` components |
| Attendee feedback (rating, NPS, comments) | `5a72919` | Migration `0006` |
| Group tickets (minimum quantity per order) | `a070d54` | Enforced in the UI and the API |
| Discount codes, recording library with a gated player, live poll creation and Q&A moderation | `c54b2ab` | Migrations `0007` to `0009` |
| Recordings served from a private bucket with short-lived signed URLs | `6f2d88c` | `S3_BUCKET_RECORDINGS` |
| Check-in: manual by code, live counter, per-tier arrivals, undo last scan, camera fallback | `e16dd75` to `44b996d` | |
| Shareable ticket cards (OG, story, square) | `11f8fe6`, `6ed6290` | |
| Brand Home `/o/<slug>` with hero variants and community subscribe | `648bf49`, `90ad21d` | Migration `0010` |
| Story Mode: block contracts, composer, renderer, analytics, preview tokens | `739d56d` to `9b657dc` | Migrations `0011`, `0012`; `packages/contracts/src/story-blocks.ts` |
| Feature-flag registry, brand analytics, design system with gated rollout | `3106c43`, `2fa2918` | Migrations `0013`, `0014`; `apps/web/lib/flags.ts` |
| SEO: sitemap, robots, ticket pages set to noindex | `b66a726` | |
| API exposure audit: mask the public ticket email, drop the internal user id from public engagement reads | `09afc68` | `API_EXPOSURE_AUDIT_2026-07-25.md` |

**Incidents in this stage**
- **Vercel build broken** by a component imported from a path that did not resolve (`2c38a14`). It went unnoticed because the production build ignores type errors. A dedicated `next build` CI gate was added in response (`64e1c5d`).
- **Check-in camera would not start,** for three separate reasons: the CSP blocked the scanner's web worker (`worker-src blob:`, `cabed64`); stale service-worker page shells kept serving the old CSP (cache bumped to v5, `7c4eea7`); and `vercel.json` set `Permissions-Policy: camera=()`, which disables the camera entirely (`a47b122`, changed to `camera=(self)`).
- **Image uploads failed** because the R2 host was missing from the CSP `connect-src` (`e422af1`).

---

## Stage 6: Discovery, pricing, security audit and idle cost (29 July to 22 September)

**Backend**
- Category and city discovery (migration `0015`) and SEO browse pages (`d9dbf0e`).
- **August security audit** (`SECURITY_AUDIT_2026-08.md`):
  - Cross-tenant access fixes (BOLA C1 and C2), social login failing open (H1), and double refunds (H2) (`5e9e01d`).
  - Postmark failing closed (M1), OTP logging and purpose confusion (M3, M4), refresh CSRF (M5), member-rank checks (M6), and discount release (M2) (`6419afb`).
  - Further hardening (`a5cb69f`).
- **Signup verification restored,** and login gated on `email_verified` (`358705e`).
- **Order settlement hold** (migration `0016`): every settlement path compares the amount and currency, and a mismatched order is held rather than issuing tickets. Admins resolve holds (`e0433f7`, merged in `5d80416`).
- **Neon idle cost:** the payment sweeps were widened and made activity-gated, and `/health/ready` probes the database at most hourly, so uptime pollers no longer keep Neon awake (`f5699ab`, `05a7ee2`, `a0f9c15`).
- **ValidationPipe destroying Story Mode payloads:** nested block data was stripped by the global whitelist. Fixed in `0ee2092`.

**Frontend**
- Pricing page rebuilt from the go-to-market tiers (`ba263e7`).
- Mobile navigation drawer for the organizer and admin dashboards (`e2f7c67`).
- Experience-first event hero, countdown and an honest urgency band on the event page (`e7e5d66`, `168695e`).
- OG banner rendering fixes, and banner and hero images carried onto share cards (`741a185` to `515c18a`).
- **Open redirect closed** in `safeInternalPath`: a `next=/%09/evil.com` link resolved off-site because URL parsers strip tabs and newlines (`8cd6fa3`).
- The invite accept page was introduced (`8593c75`).

---

## Stage 7: Organizer depth (22 to 30 September)

**Backend and frontend together**
- **Custom registration questions,** in three slices: schema and API, composer, register form (`239a2e9`, `1a6f4e7`, `156a54d`; migration `0017`). This was followed by conditional questions (show-if) and info notes with links (`b5db664`). A missing `@Type` on `registrationFields` let the ValidationPipe coerce the items (`e746cdc`).
- Core event details editable after creation (`8bac623`); a per-event toggle to hide the questions intro (`6902c38`, migration `0018`).
- Remaining tickets shown on the public and register pages (`9a70d0f`).
- **VIP express registration links:** a per-event token, a short form, VIP tagging (`f56e58e`, migration `0019`), and later compact custom-word links `/e/<code>/vip/<word>-<suffix>` (`f9fa6e8`).
- **Ticket tiers:** edit name, price, currency and quantity with a sold-count guard (`e061499`), plus a guarded force-delete that protects paid orders and check-ins (`06be834`, `d35c142`).
- **Venue reveal:** the venue, address and join link appear only on the ticket (`27ec759`, migration `0024`).
- **Live second screen:** join the live room with a ticket (`9b8785a`), an organizer "on screen now" spotlight (`1a87c69`, migration `0025`), a "Happening now" band on Story pages (`fd61e25`), and a register-first gate on the live room (`8542099`).
- `schema.sql` reordered so it loads top to bottom: the order foreign keys are attached after `orders` exists (`bd5d49b`).
- Development-only CSP relaxation so Next dev mode and hot reload work (`7114ac1`).
- A dashboard month chart that was off by one month for users east of UTC (`0b624bf`).

---

## Stage 8: Platform fee and connected accounts (26 September to 7 October)

Built in deliberate slices, all switched off by default. The rollout plan is in `PLATFORM_FEE_ROLLOUT.md`.

| Slice | What | Commits |
|---|---|---|
| 1 | `events.platform_fee_bps` stamped per event at creation (grandfathering), fee schedule config | `ed7b40d` (migration `0020`) |
| 1b | Flat fee per paid ticket alongside the 3% | `9199748` (migration `0021`) |
| 2 | Connected-accounts model, endpoints and checkout gate behind `PAYMENTS_CONNECTED_ACCOUNTS` | `cef59d4` (migration `0022`) |
| 2b | Paystack payout-account onboarding (banks, resolve, subaccount) and the Settings form | `7ec73cf`, `2f3aea4` |
| 3 | Paystack split at checkout (`transaction_charge` is the platform fee) | `7e19ad0` |
| 4 | Fee-aware refunds (buyer refunded in full, platform fee returned) | `dfcba7c` |
| Config | Env-driven schedule, flat fee per currency (NGN 1,350 recorded as `PLATFORM_FEE_FLAT_NGN=135000`) | `3ffa69c`, `167d805` |
| Pass-on | Organizer can pass the fee to the buyer; the exact service fee shows before checkout | `c3fe7b8` (migration `0023`) |
| Flutterwave | Subaccount split (`transaction_charge_type: 'flat'`, major units) and onboarding | `e31ed14` |

**Decision (7 October):** Stripe is not being pursued; only Flutterwave goes ahead as the second provider (`7e2ea91`, `STRIPE_FLUTTERWAVE_SPLIT_SCOPE.md`). A Flutterwave refund is funded from the platform balance, which may call for a "recoverable from organizer" ledger entry depending on what the test-mode run shows.

**Status:** the fee is off in production. Go-live gates are listed in `FEE_GOLIVE_CHECKLIST.md`: the 60-day notice under the Terms, counsel sign-off, Paystack and Flutterwave test-mode verification, and organizer payout onboarding.

---

## Stage 9: First large live event, WMXKED (3 to 23 October)

The first event at scale exposed operational gaps, which were fixed under time pressure.

### Render outage and missing ticket emails (3 to 5 October)
- **What happened:** a Render downtime meant some registrants received no confirmation email, so they had no QR code or ticket code.
- **Fixes:**
  - **Roster check-in:** the organizer checks someone in straight from the per-event registrations list, with no QR or code needed (`c0b4736`).
  - A live checked-in counter in the registrations header (`61e2cf8`).
  - Email delivery failures now raise Sentry events, and an admin endpoint resends ticket confirmations (`e4171b4`).
- **Root cause of the continued email failures:** the Postmark account was on a plan capped at 100 emails. The operator found and upgraded it. Code was not at fault.
- Privacy changes in the same window: live-feed names redacted to first name plus last initial, and ticket codes scrubbed from request logs (`6491bb4`). The live gateway was hardened per a security review (`ff757f2`).

### Duplicate tickets (12 to 13 October)
- **What happened:** registrations showed 121 while tickets issued showed 126. Re-submitting a free registration during the outage issued extra tickets.
- **Fixes:** free-tier re-registration became idempotent (`0bb0b66`), and counts now include only live tickets (`ce738bd`). Operator-run cleanup scripts released the duplicate and test seats (`scripts/ops/wmxked-*.sql`). The first script's guard correctly refused to run when it found 3 duplicates rather than the expected 5, and was rewritten to use explicit ticket codes.

### Campaigns for the event (16 to 18 October)
- Optional flyer image with a download button (`32ce4ec`, migration `0026`); preview text, subject tokens and named test sends (`7ae4b3e`); an organizer-branded header, using the logo or else the name (`5a0f67e`); a mailing address per organization in the footer (`d3aac2d`, migration `0027`); a campaign detail page, with test sends no longer creating drafts (`c0f9206`).
- **Incident:** the API build broke from `7ae4b3e` onward. An editor turned the `\u2028\u2029` escapes inside a regex in `campaigns/markdown.ts` into the literal invisible characters, leaving the regex unterminated. Render kept serving the old build while Vercel deployed the new web. The symptoms looked unrelated: `property eventId should not exist` (deploy skew), the Orkora banner instead of the organizer's, and "Hi ," in test sends. Fixed in `3228f04`. Since then every changed file is checked for literal U+2028 and U+2029 characters before commit.

### Registration close and counts (21 October)
- The per-event roster was capped at 200 rows; it now loads all registrations (`accbc5d`).
- A "Sales close" control was added to the dashboard tier form (`accbc5d`).
- **Branded links stopped showing tiers once a close time was set,** because the public slug read filtered `saleEndsAt: null`. Fixed, and every page now says "Registration closed" when all tier sales have ended (`128b77b`, `ticketingState()` in `apps/web/lib/events.ts`).

### Dry run fixes (22 October)
- **Create poll looked broken:** polls require an agenda session and WMXKED had none, so the button was disabled with only a faint hint. A clear callout now links to the Sessions section (`cbcab88`). Making polls work without a session is an open item.
- **Analytics revenue overcounted** in the org events breakdown, because joining registrations, orders and tickets in one query repeated each order once per ticket (`6109a70`).
- **Anonymous Q&A:** attendees can tick "Ask anonymously", and the name is hidden from attendees and organizers alike (`f18ee24`, migration `0028`).
- **Invites:**
  1. Accepting an invite left the browser holding a token issued before the membership existed, so the dashboard showed "create an organization". The session is now refreshed after accepting (`46c88d6`).
  2. Opening the invite in a browser signed in to another account was a dead end. There is now a "Sign out and use the invited email" button (`056ff6c`).
  3. The sign-in step is explained, with "Email me a sign-in code", no password needed (`bc36533`).
  4. Reopening a used invite sends existing members to the dashboard (`28d5ce8`).
- **Admin console:** the users list is segmented (organizers, ticket holders, no activity, platform team), with organizations shown per user, sorting and pagination (`0cde11d`). The old list silently stopped at 50 rows.
- **Admin deletion** of users and organizations (built 22 October, **not yet committed** when this was written). It has a preview of what would be removed, a typed confirmation, and a single transaction. It never deletes financial records: users with payments can only be erased (details scrubbed, records kept), and organizations that took money can only be suspended. It was verified against a real Postgres built from `schema.sql` plus all migrations.

### Operational notes from this stage
- Team roles apply to the whole organization. Staff can see every event's attendee list and analytics revenue. Access was granted for the event and is to be revoked afterwards. Removing a member takes effect within 15 minutes, which is the access token lifetime.
- `git push` returned a 403 when the local Git credentials belonged to a GitHub account without write access to `EmperorC-ops/Orkora`.

---

## Incident and fix register

Quick reference. Dates are commit dates.

| Date | Symptom | Root cause | Fix |
|---|---|---|---|
| 10 to 11 May | Render build failures | pnpm workspace packaging in Docker | `pnpm deploy` with injected workspace packages; Prisma generate in the deploy folder |
| 22 May | Registration returned 500; times wrong | Lost helpers; times not converted to the event timezone | `794526b` |
| 22 May | R2 presigned uploads rejected | AWS SDK default checksum unsupported by R2 | `aaa463e` |
| 23 May | All Stripe calls failed | Invalid Stripe API version string for the SDK | Pinned `2024-04-10` (`2d07639`) |
| 23 May | Paid but no ticket | Settlement depended on the webhook alone | Verify-on-return plus reconciliation (`91a3be3`, `59a3b8a`) |
| 25 May | CI red on every push | Prisma Client not generated in CI, plus several smaller errors | `463aec0` and others |
| 3 to 4 June | Files cut short after edits | NUL byte or truncated writes during bulk edits | Restored tails (`9b94ee6`, `ce13b31`) |
| 7 July | Interactive pages dead in production | CSP nonce never applied, so scripts were blocked | `394382e` |
| 22 July | Returning users stuck signed out; new users with `Bearer undefined` | Host-only cookies; signup never issued a session | `e1a6096`, `2e4f4b9` |
| 23 July | Vercel build broken | Unresolvable import, masked by ignored type errors | `2c38a14`; web build CI gate `64e1c5d` |
| 23 to 24 July | Check-in camera would not start | CSP worker-src, stale service-worker shells, `Permissions-Policy camera=()` | `cabed64`, `7c4eea7`, `a47b122` |
| 18 August | Cross-tenant access possible | BOLA in org-scoped routes | `5e9e01d` |
| 2 September | Unverified signups could log in | Verification gate missing | `358705e` |
| 10 September | Story Mode blocks saved empty | Global ValidationPipe whitelist stripped nested payloads | `0ee2092` |
| 22 September | Open redirect via `next=` | Tab and newline stripping by URL parsers | `8cd6fa3` |
| 3 to 5 October | Registrants without ticket emails | Render downtime, then the Postmark 100-email plan cap | Roster check-in, resend tool, plan upgrade |
| 12 October | 126 tickets for 121 registrations | Free re-registration issued new tickets | `0bb0b66`, `ce738bd`, ops scripts |
| 18 October | `property eventId should not exist`, wrong banner, "Hi ," | API build broken by literal U+2028 in a regex; web deployed ahead | `3228f04` |
| 21 October | Tiers vanished on the branded link | Public read filtered on `saleEndsAt: null` | `128b77b` |
| 22 October | Inflated revenue in the analytics breakdown | Row multiplication in an aggregate join | `6109a70` |
| 22 October | Invitee shown "create an organization" | Stale access token after accepting | `46c88d6` |

---

## Decisions log

| Date | Decision | Where recorded |
|---|---|---|
| May | Host on Render, Vercel, Neon and R2 instead of the AWS blueprint | `DEPLOY.md` |
| 3 June | Neon replaces Render Postgres | `render.yaml` comments, `docs/dr/` |
| Date not recorded | Forward-only SQL migrations plus `schema.sql`; no Prisma migrate | `apps/api/scripts/migrate.mjs` header |
| 5 September | `api.orkora.events` is the canonical production API host | `ea92c4f` |
| 26 September | Platform fee is 3% plus a flat fee per paid ticket, grandfathered per event, scheduled by environment variable, off by default | `apps/api/src/common/platform-fee.ts`, `PLATFORM_FEE_ROLLOUT.md` |
| 7 October | Stripe not pursued; Flutterwave is the second provider | `STRIPE_FLUTTERWAVE_SPLIT_SCOPE.md` |
| 13 October | Private-beta wording retired from product copy (not yet from the Terms) | `add3c46` |
| 22 October | Anonymous Q&A hides the name from organizers too | `engagement.service.ts` |
| 22 October | Deletion never removes financial records | `admin-deletion.service.ts` |
| 22 October | Fee activation and full general availability deferred until after WMXKED | This document, README section 13 |

---

## Lessons that became rules

Each rule exists because of a specific incident above. The full list is in README section 11.

- **Invisible characters break builds.** Check changed files for U+2028, U+2029 and NUL bytes.
- **A build that ignores errors hides them.** Keep the CI typecheck and the `next build` gate green; do not rely on Vercel or SWC to catch errors.
- **Render keeps the last good build.** A failed API deploy looks like a strange behaviour bug in the web app. Check the Render deploy result first.
- **Membership changes need a token refresh.** Anything that adds or removes a membership must be followed by `refreshSession()` on the web.
- **Browser policy changes are deploys too.** CSP, `Permissions-Policy` and service-worker versions must move together.
- **Aggregates over joins multiply rows.** Compute each figure in its own subquery or common table expression.
- **Nested DTOs need `@ValidateNested` and `@Type`,** or the global whitelist will strip their contents.
- **Operational scripts need guards.** Production SQL previews first, checks counts, and refuses to run when reality differs from expectation.
- **Check the vendor plan before blaming the code.** The 100-email cap looked exactly like a code bug.
