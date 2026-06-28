# Orkora threat model

Per-feature attacker scenarios + the controls that stop them. This is the OWASP A04 (Insecure Design) gap the security harness can't automate; everything below is a deliberate design decision documented so that changes to these features come with a fresh review.

Companion documents:
- `SECURITY_REVIEW_2026-05-30.md` — point-in-time audit of fixes shipped
- `SECURITY_AUDIT.md` — automated harness running on every push
- `OUTSTANDING.md` — outstanding items + manual checks
- This file — per-feature threat scenarios

## Methodology

For each feature surface, we walk through:

- **Asset.** What the attacker wants.
- **Actor model.** Anonymous, registered user, malicious organizer, malicious staff, compromised supply chain.
- **Attack scenarios.** Concrete steps the attacker would take.
- **Controls.** What stops each scenario today.
- **Residual risk.** What still keeps the security team up.

Scope: the platform as it stands at branch `staging` HEAD. New features must be added here before merging to main.

---

## 1. Identity + auth

**Asset.** Account takeover. With control of an organizer account, the attacker can drain ticket revenue, expose every attendee's email, send malicious campaigns, and damage the org's reputation.

**Actor model.**
- Anonymous attacker with credential-stuffing lists
- Anonymous attacker with phishing infrastructure
- Insider with limited org role wanting platform admin

**Scenarios.**

1. Credential stuffing against `/v1/auth/login`. *Stopped by* per-account exponential backoff (`SECURITY_REVIEW_2026-05-30` §4.1) + per-IP throttler + bcrypt-class argon2 verification cost.
2. Brute-forcing OTP codes against `/v1/auth/otp/verify`. *Stopped by* 5-attempt cap per code + per-destination hourly cap + 10-minute code TTL.
3. Phishing the OTP code from the user. *Mitigated by* dedicated subject line + per-org branding (recipients are trained to expect "Your Orkora code"); *residual risk* exists.
4. Stealing the refresh-token cookie via XSS. *Stopped by* HttpOnly cookie + strict CSP nonce middleware (`SECURITY_REVIEW_2026-05-30` §16.5) + DOMPurify-equivalent escape in the campaigns markdown renderer.
5. Replaying a stolen refresh token after the victim has logged out. *Stopped by* refresh-token reuse detection that revokes the entire token family on the second use.
6. Forging a JWT with `alg=none` or a known weak key. *Stopped by* RS256-only verifier + `kid`-based dispatcher; tests in `apps/api/src/modules/auth/strategies/jwt.strategy.spec.ts` and `security/api-authz-tests/tests/02-invalid-tokens.test.mjs`.
7. Promoting a regular user to admin via payload injection on PATCH /me. *Stopped by* server-side derivation of role from the JWT claim, never the request body; tested in `security/api-authz-tests/tests/04-payload-mutation.test.mjs`.
8. Insider accidentally getting platform-admin scope. *Stopped by* explicit `platformRole` on User; default value `'none'`; promotion requires existing platform admin AND an audit-log row.

**Residual risk.**
- A motivated phishing campaign targeting a specific organizer with a convincing fake `orkora.events` page is not stopped by anything technical. WebAuthn / passkeys would help here; logged as a post-launch follow-up.
- Apple OAuth verification trusts Apple's `iss=https://appleid.apple.com`. If Apple's JWKS endpoint is ever DNS-hijacked we'd be exposed; depending on Apple feels safe enough.

---

## 2. Payments + refunds

**Asset.** Money. Fraudulent purchase, fraudulent refund, double-spend, intercepted payout.

**Actor model.**
- Anonymous card-tester (Stripe BIN attack)
- Buyer trying to keep both the ticket and the refund
- Organizer trying to drain refundable funds before the chargeback window
- Compromised provider webhook source

**Scenarios.**

1. Card testing — many small charges across cards. *Mitigated by* Stripe Radar at the provider layer + per-IP rate limiting on checkout creation.
2. Double-spending a ticket — refunded then resold by attendee. *Stopped by* refund-settles → ticket voided in the same transaction (`SECURITY_REVIEW_2026-05-30` §14.1). Scanner rejects.
3. Forged refund webhook from a non-provider source. *Stopped by* HMAC signature verification per provider (Stripe `STRIPE_WEBHOOK_SECRET`, Paystack signature header, Flutterwave `secret_hash`).
4. Replay attack against webhooks. *Stopped by* idempotency-key lookup before settle; per `(orderId, eventType)` unique constraint on the webhook ledger.
5. Race between two webhooks settling the same order. *Stopped by* Postgres advisory lock on the order id during settle.
6. Refund-then-charge race (attendee refunds, immediately tries to use the ticket). *Stopped by* the ticket void runs in the same transaction as the refund record-write.
7. Provider downgrade (intercept TLS) sending plaintext keys. *Stopped by* TLS + we never accept inbound webhooks over HTTP (HSTS + the API rejects).
8. Forging a Stripe-styled-but-fake provider signature. *Stopped by* each provider verifier in `apps/api/src/modules/payments/providers/` does the cryptographic check before any DB side-effects.

**Residual risk.**
- Chargebacks happen 60-180 days after the original purchase; we have no automated chargeback-handling flow. Manual today; logged for post-launch.
- Multi-currency arbitrage: if FX rates between USD and NGN move sharply between order creation and settle, the buyer-charged amount and the org-paid amount diverge. Currently absorbed by Orkora's float; not a security issue but a margin one.

---

## 3. Tenancy isolation

**Asset.** Cross-tenant data exposure. Org A reading Org B's attendees / orders / events would be the single most damaging breach we could ship.

**Actor model.**
- Malicious organizer in Org A trying to read Org B
- Malicious organizer in Org A trying to write to Org B
- Inside attacker with read access to one org wanting cross-org reach

**Scenarios.**

1. User A swaps the path-param `:orgId` to point at Org B. *Stopped by* every controller resolves user→org membership via the JWT and rejects if not a member. Tested in `security/api-authz-tests/tests/03-cross-tenant.test.mjs`.
2. User A submits `body.organizationId = B.id` to create an event. *Stopped by* server-side derivation of organizationId from the resolved scope, body field ignored.
3. User A guesses an event UUID from Org B and reads `/v1/public/events/<code>` (public endpoint). *By design* — published events are public. *Mitigated by* `/v1/public/events/<code>` returns only the public-safe subset of fields; never PII, never financial data.
4. Custom segment in campaigns audience builder constructs SQL that reaches across orgs. *Stopped by* the audience materialiser always adds `WHERE event.organizationId = :orgId`; the custom-spec engine (Slice B) compiles to a parameterised Prisma query, never raw SQL. Slice A only supports the `all-registrations` smart segment.
5. Postmark webhook arrives with a MessageID that matches a row from a different org. *Mitigated by* lookup by MessageID returns the original send row, which has its own `organizationId`; the suppression list write uses that org. Cross-org leak impossible by construction.
6. Cross-tenant SSRF via campaign body image URL. *Out of scope* — campaign body markdown does not currently support images (Slice B will reuse existing R2 uploads which require an authenticated presign already scoped to the org).

**Residual risk.**
- A future endpoint added without using the tenancy interceptor would silently leak. *Mitigated by* the new ESLint rule (planned for #63) that fails the build if a controller accepts an `:orgId` param without `@CurrentOrg()` decorator usage; for now the api-authz tests catch it post-merge.

---

## 4. Email + campaigns

**Asset.** Sender reputation (Orkora's and per-org), recipient inboxes, organizer's trust that we won't leak their attendee list.

**Actor model.**
- Spammer organizer using Orkora to send bulk marketing without consent
- Compromised organizer account being used for phishing
- Attacker forging a campaign send to plant a phishing link

**Scenarios.**

1. Organizer imports a CSV of cold-purchased emails and blasts. *Mitigated by* the campaigns audience layer only sources recipients from registrations (people who opted in by registering for the org's event). No "paste a CSV" pathway. *Residual risk* exists if an organizer registers many ghost attendees first.
2. Organizer sends a campaign whose body has `<script>` to attempt credential harvesting in HTML inboxes. *Stopped by* the markdown renderer escapes all HTML; explicit test in `campaigns.service.spec.ts`.
3. Organizer adds `javascript:` links to the body. *Stopped by* the URL sanitiser rewrites any non-http(s)/mailto/tel scheme to `#`.
4. Organizer's API key is stolen and used to send rogue campaigns. *Mitigated by* per-org per-minute send rate limit + audit log on every send + Slice D adds per-org Postmark child accounts so a single bad actor cannot poison the shared sender.
5. Attacker forges a Postmark webhook to mark a victim as unsubscribed. *Mitigated by* webhook source IP allowlist (Slice D) and Postmark signature verification (Slice D); Slice A relies on the message-ID being non-guessable but does not cryptographically prove origin. *Documented gap.*
6. Recipient clicks unsubscribe but it doesn't work. *Stopped by* HMAC verification of the unsubscribe URL + audit log on every unsub action.
7. Recipient's unsubscribe email is used to unsubscribe a different account at the same domain. *Stopped by* the suppression is per-(organizationId, email); unsubscribing from Org A's mail does not gag Org B's mail at the same recipient.

**Residual risk.**
- Slice A trusts the `fromEmail` field for outbound; nothing stops an organizer from putting `notifications@apple.com` and sending phishing-flavoured mail. Postmark won't deliver it (DKIM alignment fails) but the operator should still see this in their console. Slice D's verified-domain enforcement closes it.
- Slice A has no email-rendering preview before send. Organizer might send a malformed message; not a security issue but a quality one.

---

## 5. Uploads + media

**Asset.** Org's R2 bucket (attempts to upload arbitrary files, fill with malware, exhaust quota). Org A's banners read by Org B.

**Actor model.**
- Malicious organizer or attendee with a session
- Anonymous attacker with a stolen presigned URL

**Scenarios.**

1. Attendee uploads malware as their avatar. *Mitigated by* R2 bucket configured to serve `Content-Type: application/octet-stream` for unknown MIME types; no execution surface in the browser. Future: Slice E adds antivirus scan on upload.
2. Stolen presigned URL is used to upload an oversized file. *Stopped by* `MAX_UPLOAD_BYTES` server-side validation + `Content-Length` signed into the presigned PUT (`SECURITY_REVIEW_2026-05-30` §16.6).
3. Stolen presigned URL is used to overwrite a different object. *Stopped by* the presigned URL is for a specific `Key` derived from the request; cannot be redirected to another path.
4. Attendee uploads a 10 GB file to exhaust org quota. *Stopped by* the MAX_UPLOAD_BYTES cap is org-level, default 8MB.
5. Organizer uploads JS into their banner URL field hoping to XSS attendees. *Stopped by* the banner is rendered via Next/Image which sets `Content-Type: image/*`; non-image responses don't render. The URL is also stored as a plain string, not interpreted as HTML.

**Residual risk.**
- We don't scan uploads for image-stego payloads or polyglot files. Low priority for the threat surface.

---

## 6. Live engagement (chat, comments, polls)

**Asset.** Real-time messaging surface. Attacker could spam, dox, harass, or impersonate.

**Actor model.**
- Disruptive attendee in a paid event
- Bot account flooding chat
- Cross-org snoop trying to read another event's chat

**Scenarios.**

1. Attendee posts hundreds of messages per second to break the UI. *Stopped by* per-user 10msg/10sec rate limit at the WebSocket gateway.
2. Attendee subscribes to `session:<sessionId>` for a session they don't have a ticket for. *Stopped by* the gateway joins room only after verifying the user has a ticket for the session's event (or is an org member); see `engagement.gateway.ts`.
3. Cross-tenant snoop: socket subscribes to a session id from a different event. *Stopped by* same membership check.
4. Attendee impersonates the organizer by setting `displayName: "Organizer"`. *Stopped by* the display name in chat is server-derived from the user record, body field ignored.
5. Attendee deletes someone else's message. *Stopped by* delete requires `org-member: moderator` role; non-mods don't see the delete button and the API rejects.
6. Replay an old message blob to make it look like a fresh post. *Stopped by* the gateway timestamps everything server-side and clients render server time, not client-supplied.

**Residual risk.**
- We don't yet have keyword profanity filtering; relies on organizer moderators. Logged as a content-moderation follow-up.

---

## 7. Public API + API keys

**Asset.** Programmatic access to org data via API key. A leaked key gives the holder whatever scopes the key was issued with.

**Actor model.**
- Disgruntled past employee with an unrevoked API key
- Public GitHub leak (org member commits the key by accident)
- Compromised partner integration

**Scenarios.**

1. Leaked key on GitHub. *Detected by* the secrets-scan job in `.github/workflows/security.yml` runs TruffleHog over every push + the full repo history. Organizer-side leaks need the organizer's own secrets scanning.
2. Past employee continues using a key after termination. *Stopped by* org admins can revoke any key from the dashboard; revocation is instant (no cache TTL).
3. Key with `events.read` scope used to call a higher-scope endpoint. *Stopped by* `@RequireScope` decorator on every public-API endpoint; mismatch returns 403 + audit log row.
4. Key used to fetch another org's data by swapping `:orgId`. *Stopped by* the key is bound to a specific orgId at creation; cross-org reach is impossible.
5. Brute-forcing key values. *Mitigated by* keys have 32-byte random suffix (`ork_<32 hex>`), one-way hashed at storage; brute force has 2^256 search space.

**Residual risk.**
- We don't yet expose a "show keys used in the last 7 days" panel for forensics. The audit log captures every authenticated call by key id, so the data is there; the dashboard surface is logged as a follow-up.

---

## 8. Operational + supply chain

**Asset.** The build pipeline, deployment, secrets, vendor accounts.

**Actor model.**
- Malicious dependency author
- Compromised Render / Vercel account
- Compromised GitHub Actions runner

**Scenarios.**

1. NPM dependency publishes a malicious patch version. *Stopped by* `pnpm-lock.yaml` pins exact versions; weekly `pnpm audit` job + Snyk (optional) flag known advisories.
2. Compromised Render account redeploys a malicious build. *Mitigated by* Render account uses SSO + 2FA; deploy hook URL is treated as a secret in `RENDER_DEPLOY_HOOK_API`.
3. Stolen Vercel project token. *Mitigated by* Vercel deploys come from GitHub via the integration, not directly via the API token; rotating GitHub→Vercel link invalidates any prior link.
4. Stolen GitHub Actions secret (Snyk, GitGuardian, Postmark). *Mitigated by* secrets are scoped per repo + per environment; rotating the secret is one PowerShell command per provider; audit log on the provider side surfaces unexpected usage.
5. Compromised Postmark account sending arbitrary mail from `orkora.events`. *Mitigated by* Postmark 2FA + IP allowlist on the management dashboard; outbound from authenticated domains only.
6. Compromised Neon database account. *Mitigated by* Neon connection requires a per-environment role + password; rotating is documented in `DEPLOY.md`; backups via PITR cannot be deleted by the role's own credentials.

**Residual risk.**
- We don't run SLSA or sigstore on our own builds. Acceptable for the current scale.
- We don't lock subresource integrity hashes on third-party CDN scripts (we use very few of them, mostly Stripe).

---

## How to use this doc when adding a feature

Before merging a feature that touches any of the eight surfaces above, the author adds:

1. A new scenario under the relevant section, OR
2. A new section for a previously unmodelled surface.

For each scenario: name the actor, name the attack, name the control. If the control isn't there yet, the feature isn't ready to merge — it ships behind a flag until the control is in.

This is non-optional for changes to: auth, payments, tenancy, campaigns, uploads, engagement gateway, public API, secrets handling.
