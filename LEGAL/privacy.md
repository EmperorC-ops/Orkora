# Privacy Policy

**DRAFT FOR COUNSEL REVIEW.** Defaults applied per LEGAL_REVIEW_PACKET.md §2. Anchored on the actual product behaviour as of the last updated date.

**Last updated:** 29 June 2026 (draft)

## 1. Who we are

Orkora Technologies Ltd ("Orkora", "we", "us") operates the Orkora event-management platform at `orkora.events`. Where this Policy refers to a "controller" we are the controller of the personal data described in Section 3 (account data) and a processor on behalf of the event organiser for the personal data described in Section 3 (attendance data). The controller for attendance data is the event organiser whose event you registered for.

Contact our Data Protection Officer at **dpo@orkora.events**.

[COUNSEL NOTE: NDPR requires a DPO once a controller processes the personal data of more than 1,000 data subjects in 6 months. Orkora is above that threshold. Operational readiness checklist in LEGAL_REVIEW_PACKET §5 includes naming an individual or appointing a DPO-as-a-service before launch. Until then, `dpo@orkora.events` routes to the founding team.]

## 2. Scope

This Policy applies when you:

- Visit `orkora.events` (the marketing site)
- Create an Orkora account
- Register for an event hosted on Orkora
- Receive an email from Orkora or from an organiser using Orkora
- Use the Orkora mobile app or installable PWA

## 3. Personal data we collect

**Account data (Orkora as controller).**

- Email address
- Full name
- Optional phone number
- Hashed password (argon2id with per-account salt and a server-side pepper)
- Verification status flags for email and phone
- Locale and preferred currency
- Platform role (default: none)
- Timestamps for account creation and last login
- Federated identifier from Google or Apple if you sign in via social login

**Attendance data (event organiser as controller, Orkora as processor).**

- Full name of attendee
- Email address of attendee
- Optional phone number
- Ticket tier and price paid
- Order and payment reference, status, and timestamps
- Check-in status and check-in timestamp
- Chat messages, Q&A entries, and poll votes submitted during a session

**Operational data (Orkora as controller).**

- Server logs (request IP, request method and path, response status, latency, request id)
- Application logs (structured events related to your actions on the platform)
- Error reports (stack traces, request context, breadcrumbs, captured in Sentry)
- Refund-and-recovery audit log entries

**Cookies and local storage (Orkora as controller).**

See Section 9 for the complete list.

## 4. Sub-processors

We use the following sub-processors to operate the platform. Adding or removing a sub-processor requires 30 days' notice to controllers via an update to this Policy.

| Sub-processor | Purpose | Data location | Categories of data |
|---|---|---|---|
| Render | API hosting | Frankfurt, Germany | All categories |
| Vercel | Web frontend hosting | Worldwide CDN, primary in Europe | All categories |
| Neon | PostgreSQL database | **Frankfurt, EU-Central-1** | All categories |
| Cloudflare R2 | Object storage for banners, avatars, organiser logos | **Western Europe** | Media uploads only |
| Upstash | Redis queue + cache | Frankfurt, Germany | Transient processing data |
| Postmark | Transactional and campaign email | United States (EU region available, see §13) | Email addresses and message content |
| Termii | SMS for OTP | Nigeria | Phone numbers and SMS message content |
| Stripe | Payment processing | Ireland (EU), United States | Order metadata, attendee email; no card data ever transits Orkora |
| Paystack | Payment processing | Nigeria | Order metadata, attendee email |
| Flutterwave | Payment processing | Nigeria | Order metadata, attendee email |
| Sentry | Error monitoring | **EU** | Error stack traces and request context |
| Google Cloud | Optional Google sign-in | Worldwide | Federated identifier and email |
| Apple | Optional Apple sign-in | Worldwide | Federated identifier and email |

[COUNSEL NOTE: hosting regions are set to defaults from LEGAL_REVIEW_PACKET §2. Verify against `apps/api/.env` on Render before publication; the deployment configuration must match what this Policy claims.]

## 5. Why we process your data

| Purpose | Legal basis (GDPR) | Legal basis (NDPR) |
|---|---|---|
| To create and maintain your account | Contract (Art. 6(1)(b)) | Necessary for performance of a contract |
| To register you for an event | Contract | Necessary for performance of a contract |
| To process payments and refunds | Contract + legal obligation | Necessary for performance of a contract |
| To send transactional emails (OTP, receipts, refund confirmations) | Contract | Necessary for performance of a contract |
| To send marketing campaigns from organisers to registered attendees | Legitimate interest (subject to opt-out) | Consent (registration to the event implies opt-in to event-related communications) |
| To prevent fraud and platform abuse | Legitimate interest | Legitimate interest |
| To debug and improve the platform | Legitimate interest | Legitimate interest |
| To comply with tax, accounting, and other legal obligations | Legal obligation | Legal obligation |

## 6. Sharing of personal data

Your data is shared with:

- The event organiser whose event you registered for (attendance data only).
- The sub-processors listed in Section 4, strictly for the purposes listed.
- Government bodies if compelled by valid legal process.
- A successor entity in the event of a merger, acquisition, or sale of substantially all of our assets (with notice to you under Section 14).

We do not sell your personal data. We do not share your data with advertisers. We do not run third-party analytics on the marketing site or in the product.

## 7. How long we keep your data

| Category | Retention |
|---|---|
| Account data | For as long as your account is active. 90 days after account closure, then deleted. |
| Attendance data | Controlled by the organiser; their retention policy applies. Orkora deletes attendance data 12 months after the event end date unless the organiser instructs us to retain it longer (in which case the organiser is responsible for compliance). |
| Financial records (orders, payments, refunds, audit log) | **6 years** from the end of the financial year, per Nigerian Companies Income Tax Act s.55. |
| Server logs | 30 days. |
| Sentry error reports | 90 days. |
| Email send logs (Postmark) | 45 days for raw logs, longer for aggregate counts. |
| Backups (Neon PITR) | 7 days for branch-level point-in-time recovery; longer for compliance snapshots. |

## 8. Your rights

Depending on the law that applies to you, you have the right to:

- **Access** the personal data we hold about you.
- **Rectify** inaccurate or incomplete personal data.
- **Erase** personal data, subject to the financial retention requirement in Section 7.
- **Restrict or object** to certain processing.
- **Data portability**: receive a copy of your data in a structured, machine-readable format.
- **Withdraw consent** at any time where processing is based on consent.
- **Lodge a complaint** with your data protection authority (in Nigeria, the Nigeria Data Protection Commission; in the EU, your local supervisory authority; in the UK, the Information Commissioner's Office).

Exercise any of these rights by emailing dpo@orkora.events. We will respond within 30 days. If we cannot honour a request (because of a legal obligation or because we cannot verify your identity), we will tell you why.

## 9. Cookies and local storage

Orkora uses the smallest set of cookies and storage entries necessary to operate the platform. We do not use cookies for advertising or third-party analytics.

| Name | Type | Purpose | Lifetime |
|---|---|---|---|
| `orkora_rt` | httpOnly cookie | Refresh token for keeping you signed in | 30 days |
| `orkora_csrf` | non-httpOnly cookie | CSRF double-submit token | 30 days |
| `access_token` | sessionStorage | Short-lived access token | tab session |
| `orkora_pending_signup` | sessionStorage | Holds signup fields between password entry and OTP verification | tab session, wiped on success or failure |
| Service-worker cache | browser cache storage | Offline access to ticket QR codes | 7 days |

We do not require a cookie banner because we do not run non-essential cookies. If we add non-essential cookies (analytics, advertising) we will publish a banner and obtain consent before they fire.

## 10. Security

Technical and organisational measures we maintain:

- TLS 1.3 in transit for all client-API traffic.
- HSTS with a 6-month max-age on `orkora.events`.
- Strict Content Security Policy with per-request nonces.
- Argon2id password hashing with a server-side pepper.
- Refresh-token rotation with reuse detection; a stolen-and-replayed token revokes the entire token family.
- Per-account exponential backoff on failed login.
- RS256-signed access tokens with `kid`-based key rotation.
- Cross-site request forgery double-submit token on the refresh endpoint.
- Per-org tenancy isolation enforced server-side and tested on every push.
- Continuous security audit pipeline (see SECURITY_AUDIT.md): dependency CVE scan, secrets scan, web bundle leak scan, transport posture check, API authorization abuse tests, OWASP ZAP baseline.
- Centralised error monitoring via Sentry with 90-day retention.
- Audit log on every privileged action (refund, role change, admin action).

No system is perfectly secure. If you discover a vulnerability please report it to security@orkora.events.

## 11. Children

Orkora is not intended for use by anyone under 16. We do not knowingly collect personal data from children under 16. If you become aware that a child has provided us with personal data, contact dpo@orkora.events and we will delete it.

## 12. International transfers

Some of our sub-processors are located outside Nigeria and the EU. Where personal data crosses a border for processing, we rely on the recipient sub-processor's standard contractual clauses (SCCs) under the EU's 2021 SCC framework, plus an adequacy assessment for the recipient country. For UK transfers we rely on the UK International Data Transfer Addendum.

## 13. Data Protection Officer

Email: **dpo@orkora.events**. Postal address: as registered with the Nigeria Data Protection Commission (NDPC).

[COUNSEL NOTE: real DPO appointment is required pre-launch.]

## 14. Changes to this Policy

We may update this Policy from time to time. Material changes will be notified to the email on your account at least 30 days before they take effect. The "Last updated" date at the top of this Policy reflects the most recent change.

## 15. Contact

- Data Protection Officer: dpo@orkora.events
- General privacy questions: dpo@orkora.events
- Account-related: hello@orkora.events
- Security disclosure: security@orkora.events
