# Outstanding

Single source of truth for everything we've left for later. Each entry has
a rough size estimate (S = under a session, M = one session, L = multiple
sessions), and points at where the gap lives.

For the security-specific list with rationale and effort, see
`SECURITY_REVIEW.md`. The high-priority items there also appear here so
nothing gets lost.

## High priority before a public launch with real money

The pre-launch list is empty. Production secrets rotation is now
scripted (`scripts/rotate-secrets.sh`) and documented in `DEPLOY.md`.

Closed since the original Apr 29 revision (kept here for the changelog):

- Refresh token moved to httpOnly cookie (`apps/web/lib/auth.ts`).
- Apple sign-in JWK signature verification (`auth/verifiers/social.ts`).
- Webhook idempotency ledger + audit log (`migrations/2026-04-28-*`).
- Sentry wiring on the API + release tagging via `RENDER_GIT_COMMIT`.
- Per-user rate limiting (`UserThrottlerGuard`).
- Request-id middleware via `nestjs-pino`.
- Org-wide dashboard pages: registrations, attendees, analytics, settings.
- API keys + per-(org, currency) payment-provider preferences.
- Org settings (profile, branding, members CRUD, invitations management).
- Refund initiation UI on the attendee detail page + dedicated audit row.
- API key Passport guard (`ork_…` prefix) + `RequireScope` decorator +
  composite `JwtOrApiKeyGuard`.
- CSP report endpoint (`POST /v1/csp-reports`) wired through helmet and
  into Sentry.
- Tracks / sessions / speakers create UI on the event detail page.
- Live stream URL on the session form, "Join live" CTA on the public
  event home when a session is in window.
- First public API endpoint via `JwtOrApiKeyGuard +
  @RequireScope('events.read')`: `GET /v1/organizations/:orgId/public/events`.
- Stripe API version configurable via `STRIPE_API_VERSION`, default
  `2025-09-30.acacia`.
- `scripts/rotate-secrets.sh` mints JWT keypair + pepper + ticket secret.
- README "What's next" refreshed to reflect the actual phase status.

## Mobile (deferred at user's request, now mostly closed)

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `pnpm install` on a Windows host                    | S    | Sandbox can't write the pnpm symlink store onto the Windows mount; run locally to materialize node_modules. |
| Smoke test register / ticket / live flows on Expo Go | S   | Static smoke (`pnpm --filter @orkora/mobile smoke`) passes. Live device run still pending. |
| EAS build secrets                                   | S    | `eas.json` is in. Replace the four `REPLACE_WITH_…` tokens after `eas init`. |

## Engagement follow-ups (Phase 6 / 6.x)

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Mobile parity for chat / polls / Q&A                | M    | Mobile event-home page has tabs; engagement isn't wired in.            |
| Organizer poll create UI                            | S    | API + websocket support exists; no dashboard form yet.                 |
| Question moderation + answered/closed states        | S    | Schema-ready; no UI controls.                                          |

## Payments / commerce follow-ups (Phase 3.x)

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Discount codes                                      | M    | New `discount_codes` table + tier validation + checkout discount.       |
| Group tickets above 1 per order                     | S    | Tier already has `isGroup` / `groupSize`; UI does not surface them.    |
| Multi-currency revenue rollup                       | S    | Dashboard picks the largest single currency. Needs a per-currency view. |
| Apple Wallet / Google Wallet pass generation        | M    | Tickets already have signed tokens; need .pkpass and Google Pay JWS.    |
| Expand the public API surface                       | S    | Mount `JwtOrApiKeyGuard` + `@RequireScope` on registrations and analytics endpoints (events list is the proof of concept). |

## Event configuration polish

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Speaker editing (currently delete + recreate)       | S    | Add `PATCH /speakers/:id` + edit form.                                 |
| Multi-day agenda drag-drop reorder on web           | M    | Contract supports it; UI is read-only.                                 |
| Magic-link tying anonymous registrations to accounts | S   | Today an anonymous registrant must use the magic-link login flow with the same email; could surface this proactively in the confirmation email. |

## Streaming and content (Phase 8 in the original blueprint)

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Recording library                                   | L    | Per-session recording links + access gating by ticket tier.            |
| In-app player                                       | M    | HLS player with chat overlay reusing the engagement gateway.           |

## Operational / observability

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Password complexity / breach-list check             | S    | Use `zxcvbn` or HIBP k-anonymity.                                      |
| R2 bucket CORS `MaxObjectSize`                      | S    | Verify after first deploy. Defense in depth around the 8 MB client cap. |

## Loose-end docs that drift quickly

| Item                                                | Size | Notes                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `EVENTAPP_BLUEPRINT.md`                             | S    | Original architectural doc. May be stale relative to the actual build now. Do a diff pass. |

## Quick wins (each is a single small slice)

These would each take a session or less and have outsized impact:

1. **Discount codes** — `discount_codes` table + tier validation + checkout discount path. Largest commerce gap.
2. **Group ticket UI** — tier already has `isGroup` / `groupSize`; surface them on the public register form.
3. **Speaker edit endpoint** — `PATCH /speakers/:id` + an edit form on the dashboard.
4. **Stakeholder digest cron** — weekly summary email per org owner using `AnalyticsService.rollup`.
5. **Mobile chat parity** — wire the engagement gateway into the mobile event-home tabs.

If a follow-up session has time for nothing else, those five together are
about a session of work and round out the commerce + content tabs.
