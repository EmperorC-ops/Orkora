# Orkora Launch Checklist (Private Beta)

The single document you use to take Orkora from "code is ready" to
"participants are in." Sections are sequential: do them in order; do not skip.

- **Pre-flight** is a go/no-go gate. Every item must be green before you move on.
- **Production dry run** is the rehearsal, run against staging.
- **Cutover** is launch day, time-boxed.
- **Rollback** is the parachute, written before you need it.
- **Comms templates** are the messages you will send.
- **First-week monitoring** is the daily checklist for the seven days after launch.

Update this file as you learn things. Keep it living.

---

## 1. Pre-flight (go / no-go gate)

### Stage 0 - Foundations

- [ ] Staging environment exists (Neon staging branch, Render staging API service, Vercel staging scope). Test keys only on staging, no production credentials.
- [ ] **Sentry**: `SENTRY_DSN` set on the prod API service. Capture verified end-to-end (set `ENABLE_DEBUG_ROUTES=true`, `curl …/v1/health/debug-sentry`, confirm the event appears in Sentry within 60s, then set the env back to `false`).
- [ ] **UptimeRobot** monitor on `https://<api-host>/health/ready` every 5 min, email alert verified (Alert Contacts page shows the address as Active).
- [ ] Render API service health-check path = `/health` (liveness, not `/health/ready`).
- [ ] **Neon Launch plan** active (7-day PITR retention, no compute cap). Required for the staging branch + the backup drill.
- [ ] Backup drill done at least once: branch from a past timestamp, switch the SQL Editor to that branch, `select count(*) from users; select count(*) from events;` returns plausible counts. RPO recorded (= the PITR window) and RTO recorded (= the time the drill took end-to-end).

### Stage 1 - Data safety + tenancy

- [ ] No `prisma db push` or `prisma migrate deploy` reachable in any CI workflow, Dockerfile, or runbook. (Already removed from `apps/api/package.json`.)
- [ ] `pnpm --filter @orkora/api db:migrate:status` against prod shows **0 pending**.
- [ ] `pnpm test` green, including: `roles.guard.spec`, `events.service.spec` (findById tenancy), `engagement.service.spec` (poll + qa:answer org enforcement), `payments.service.spec`, `auth.service.spec` (refresh reuse), `otp.service.spec`.

### Stage 2 - Payments

- [ ] Stripe webhook destination listening to all six events (the four `checkout.session.*` plus `charge.refunded` + `charge.refund.updated`); URL = `…/v1/payments/webhook/stripe`; signing secret in Render matches the dashboard's secret.
- [ ] Paystack webhook (only if you are taking African currency at launch): URL set, signing secret matches `PAYSTACK_SECRET_KEY`.
- [ ] Reconciliation cron is live: search Sentry / logs for `"Payment reconciliation"` and `"Refund reconciliation"` in the last 24h; you should see periodic clean ticks.
- [ ] One real refund flow proven on prod: refund a paid order; row flips to REFUNDED within seconds (verify-on-action); no duplicate receipt email.

### Stage 3 - Security

- [ ] `CORS_ORIGINS` on the prod API contains only your production web origin(s). No `*`. No localhost. Trim sanity check: a curl from a non-allowed origin gets a missing `Access-Control-Allow-Origin` response.
- [ ] `STRIPE_API_VERSION` pinned to `2024-04-10` (or whatever the current Stripe SDK supports).
- [ ] `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `REFRESH_TOKEN_PEPPER` / ticket secrets rotated since any time they were ever in a repo or chat (use `scripts/rotate-secrets.sh`).
- [ ] Rate limits sanity check: `curl -i -X POST …/v1/auth/login` returns `X-RateLimit-Limit: 10`.
- [ ] Web CSP report stream is clean over a 24h window before flipping the header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.

### Stage 4 - Reliability

- [ ] Render API on an always-on plan (no cold starts). Verify: hit `/health` after 30 min of idle; first response is fast.
- [ ] Migration `0002_hot_path_indexes.sql` applied. Verify in psql: `\d orders` lists `orders_status_created_at_idx` and `orders_user_id_created_at_idx`.
- [ ] No `Too many clients` or `connection refused` errors in the last 24h.

### Stage 6 - Legal + NDPR

- [ ] Every `[FILL IN]` placeholder in `/legal/{terms,privacy,refunds,organizer}` replaced with real company values (legal entity name, registered address, governing-law jurisdiction, platform fee posture, Neon region, DPO name + email, liability cap currency / amount).
- [ ] Nigerian counsel has reviewed the four pages; draft banner removed from `apps/web/app/legal/layout.tsx`.
- [ ] `privacy@orkora.io` stubbed to a real inbox, 30-day DSR SLA documented; DPO designation recorded.
- [ ] SPF / DKIM / DMARC for the Postmark sending domain all `pass` in an inbox header view (Gmail "Show original" or mail-tester.com).
- [ ] ROPA + breach runbook + DSR workflow artifacts produced and owners assigned (see LAUNCH_RUNBOOKS section 6.1).

---

## 2. Production dry run (against staging)

Run this whole script against staging in one sitting. If any step fails, fix it before launch. Target wall-clock: ~90 minutes.

1. Sign up a new attendee with email + OTP; confirm the OTP email arrives within 30s and the code works.
2. Create a new org; create a draft event; upload a banner image; add a track, a session (with a stream URL), a speaker (with avatar), and one paid + one free ticket tier.
3. Publish the event; open the public landing in an incognito window; confirm the event details render correctly and the registration CTA works.
4. From a second account, register for the paid tier; complete Stripe checkout with a test card (`4242 4242 4242 4242` if Stripe test mode); land on the confirmation page.
5. Confirm within 2 min: ticket confirmation email + payment receipt email both arrive at the second account.
6. Open the event live page; post a chat message; submit a poll vote; ask a Q&A question. As the organizer in the first account, answer the question and confirm only that account can answer.
7. From the organizer dashboard, refund the paid order; confirm it flips to REFUNDED within a few seconds (no manual Re-check needed) and that no duplicate receipt is sent.
8. From the organizer, run the check-in flow against the free-tier registration's QR.
9. Set `ENABLE_DEBUG_ROUTES=true` on staging; `curl …/v1/health/debug-sentry`; confirm a "Sentry test error" event appears within 60s; set the env back to `false`.
10. Stop the staging API service for 30s; confirm an UptimeRobot email fires; restart; confirm recovery email.
11. Add a comment-only migration file (`0003_dryrun_noop.sql` with just `-- noop`); push; confirm the runner records it on next deploy (`db:migrate:status` shows it as applied). Delete the file from the next commit to keep the migrations list clean (or leave it; it's just a comment).

---

## 3. Cutover sequence (launch day)

### T-24h
- Code freeze on `main` except for critical fixes.
- Walk the Pre-flight checklist top to bottom one more time; every item green.
- Send the "Launching tomorrow" email (template in section 5).

### T-2h
- Take a fresh Neon backup or note the current PITR timestamp (write it here: `__________`).
- Confirm Render + Vercel are deploying the exact commit you intend to launch.
- Confirm Sentry is receiving 5xx events and UptimeRobot is armed.
- Reset reconciliation cron logs to clean baseline (or note "drift in last 24h: 0").

### T-0
- Flip whatever toggle opens the platform to beta participants (env flag, feature flag, or just the public event URL becoming shareable).
- Send the "We're live" email with each participant's invite link.
- Watch Sentry + UptimeRobot + the reconciliation logs in real time for the first 60 minutes.

### T+24h
- Skim every Sentry issue from the first day; triage anything new.
- Search logs for `"drift detected"` from the reconciliation crons; investigate any hits.
- Verify in psql: `select count(*) from orders where status = 'pending' and created_at < now() - interval '1 day';` returns 0 (the TTL sweep is doing its job).
- Send the day-1 thank-you email.

---

## 4. Rollback

If something material breaks in the first 60 minutes after T-0:

1. **API rollback**: in Render, click the previous successful deploy and "Rollback". This pulls the previous container image; no rebuild needed. The migration runner ignores migrations that are already recorded, so rolling code back does not roll the schema back (additive forward-only migrations stay applied; that is by design and safe).
2. **Web rollback**: in Vercel, promote the previous production deployment. Instant.
3. **Database rollback** (only if a data corruption is implicated, not a code bug): create a Neon branch from the T-2h PITR timestamp recorded above; switch the API service's `DATABASE_URL` env var to the branch's connection string; restart. Stop new writes during the swap by either toggling the platform off, or by switching the API to maintenance mode.
4. Send the "We hit a snag" email (template in section 5). Be specific about when you will be back.
5. Post-mortem within 48h: what went wrong, what we caught, what we missed, what we change. Update this file.

---

## 5. Comms templates

### Launching tomorrow (T-24h)

Subject: Orkora goes live tomorrow at [TIME]

Body: Short. The event link, what to expect, where to ask for help. One paragraph + a CTA button is enough.

### We are live (T-0)

Subject: Orkora is open

Body: The link, the first thing they should do (sign in / pick an event), the help email. Three sentences max.

### We hit a snag (rollback)

Subject: Brief pause, we will be back shortly

Body: One sentence on what happened, one sentence on when we will be back, one sentence on what they should or should not do in the meantime. Honest, short, calm.

### Day 1 thank-you (T+24h)

Subject: Day 1 - thank you

Body: A line of gratitude, a line on what we noticed, a link to a one-question feedback form.

---

## 6. First-week monitoring

Daily for seven days after T-0:

- **Sentry**: any new 5xx classes? Any spike in 4xx rate?
- **UptimeRobot**: any flapping or false alarms? If so, tune.
- **Reconciliation logs**: search for `"drift detected"`. Investigate every hit.
- **Audit log**: skim `audit_events` for unexpected admin actions, especially refunds, role changes, suspensions. `select action, count(*) from audit_events where occurred_at > now() - interval '24 hours' group by action order by 2 desc;`.
- **Support**: reply to every `support@orkora.io` within 24h. Track recurring themes in a single doc; they become the next sprint.

After seven clean days the private beta has graduated to "stable." Schedule the post-mortem, write the public-launch sub-plan (which mostly means closing the SCALE-tagged items from LAUNCH_READINESS), and decide the public-launch date.
