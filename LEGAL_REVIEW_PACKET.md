# Orkora — Legal Review Packet

**Prepared:** 2 June 2026
**For:** Counsel reviewing the four public legal documents prior to first-party-domain launch
**Documents under review:** Terms of Service, Privacy Policy, Refund Policy, Organizer Agreement

This packet exists so counsel can review the public legal docs without having to read the codebase. Every clause is grounded in current product behavior. Where the doc says "we do X", the code does X today.

---

## 1. What changed in this revision

All four documents were rewritten from earlier placeholder drafts to:

- Anchor every clause in actual product behavior, not aspirational language.
- Add a counsel-review checklist as a comment at the top of each file.
- Add specific product mechanics that the prior drafts were silent on: refund settlement via verify-on-action plus webhook plus reconciliation sweep, ticket QR voiding on refund (new in 2026-06-01), notification-log idempotency (so refund and paid emails are sent exactly once), refresh-token rotation with reuse detection, per-account exponential backoff on login.
- Replace `[FILL IN]` markers with `[BRACKETED, default: <suggestion>]` so counsel has a concrete starting point.
- Add a complete sub-processor table to the Privacy Policy.
- Add a retention schedule the controller can defend (6 years for financial records per Nigerian CITA, 30 days for server logs, 90 days for Sentry, etc.).
- Add a security-disclosure clause to the Terms with the responsible-disclosure SLAs we will actually honour.
- Add an explicit beta-service caveat (no SLA, product may change, 60-day notice before any platform fee is introduced).
- Add chargeback-rate, KYC threshold, abuse-takedown SLA, and marketing-comms rules to the Organizer Agreement.
- Add a complete cookie + local-storage list to the Privacy Policy that exactly tracks the code (`orkora_refresh`, `orkora_access` in sessionStorage, `orkora_pending_signup` in sessionStorage).

---

## 2. Values counsel must fill in

The four documents share a small set of bracketed values. Setting these once below propagates everywhere.

### Entity and registration

- **Legal entity name** — currently `[LEGAL ENTITY NAME, e.g. Orkora Technologies Ltd]`
- **Registration number** (RC for Nigeria, equivalent elsewhere) — currently `RC [number]`
- **Registered address** — currently `[REGISTERED ADDRESS]`

### Governing law and venue (Terms s.14)

- **Governing law** — default suggestion: `Federal Republic of Nigeria`
- **Exclusive venue** — default suggestion: `Lagos, Nigeria`

### Liability cap (Terms s.12)

- **Cap floor** — default suggestion: `the equivalent of US$1,000 in your local currency`
- The cap is structured as the greater of the floor or fees paid in the trailing 12 months. Counsel should confirm consistency with our insurance posture (we do not currently carry E&O or cyber).

### Data protection (Privacy s.13)

- **Data Protection Officer name and email** — default suggestion: `dpo@orkora.events`. NDPR requires a DPO for controllers processing personal data of more than 1,000 data subjects in 6 months; we are above that threshold, so a real DPO appointment is required.
- **EU representative**, if we accept EU residents at launch. If we do, GDPR Art. 27 requires an EU-based representative.

### Sub-processor regions (Privacy s.4)

- **Neon region** — default suggestion: `Frankfurt, EU-Central-1`
- **Cloudflare R2 region** — default suggestion: `Western Europe`
- **Sentry region** — default suggestion: `EU`
- These must match our actual deployment configuration; check `apps/api/.env` on Render.

### Retention period for financial records (Privacy s.7)

- **Financial retention** — default suggestion: `6 years` (Nigerian Companies Income Tax Act s.55 sets the floor at 6 years for financial records).

### Platform fee posture (Terms s.7, Refunds s.6, Organizer s.3)

- **Platform fee** — default during beta: `no platform fee during private beta`. Counsel should confirm we are comfortable with this language as a contractual commitment for the duration of the beta.
- **Platform fee refund treatment** — default during beta: `Orkora does not charge a platform fee on paid tickets, so there is no Orkora platform fee to refund or retain`.

### KYC threshold (Organizer s.1)

- **Threshold for additional verification** — default suggestion: `the equivalent of US$5,000 settled in a rolling 30-day window`. This is the Orkora-side threshold, on top of whatever the payment provider runs at onboarding.

### Data Processing Agreement (Organizer s.7)

- **DPA reference** — currently `[ORKORA DATA PROCESSING AGREEMENT, link or attached as Exhibit A]`. We do not have a separate DPA yet. Counsel should advise whether the Privacy Policy's sub-processor table and retention schedule are sufficient, or whether we need a standalone DPA template for Organizers to sign as Controllers.

---

## 3. Specific review questions per document

### Terms of Service

1. The beta-service caveat (s.4) is strong language. Is it sufficient to limit liability for the beta period?
2. The sanctions clause (s.1) lists OFAC, UN, and EU consolidated lists. Are there additional regimes we should reflect (e.g., HM Treasury for UK organizers)?
3. The export of Orkora data to a competitor for the purpose of building a competing service is prohibited in s.5. Is this enforceable in our default jurisdiction, or do we need a softer formulation?
4. The arbitration question: s.14 sends disputes to courts in `[VENUE]`. Should we add a tiered escalation (mediation, then arbitration, then courts)?
5. The security disclosure clause (s.13) is a public commitment to not pursue legal action against good-faith researchers. We are comfortable making this commitment; counsel should confirm the wording does not waive anything we need.

### Privacy Policy

1. The dual-posture framing (NDPR + GDPR + UK GDPR) is intentional because the platform sells in NGN and USD and runs from EU infrastructure. Counsel should confirm we are not over-claiming GDPR applicability if our actual EU footprint is small.
2. The retention schedule (s.7) sets concrete numbers. Each number is defensible against NDPR's "no longer than necessary" principle, but counsel should confirm none are aggressive against industry norms.
3. The cookie list (s.9) is exhaustive. We do not run third-party analytics or advertising. If we add Plausible or PostHog later, the list must be updated.
4. The sub-processor table (s.4) is the canonical list. Adding or removing a row requires a 30-day notice (s.4 last paragraph). Confirm this commitment is operationally sustainable.
5. The DPO appointment (s.13) is required given our throughput. Confirm we have a candidate or an outsourced DPO before launch.

### Refund Policy

1. The three-path settlement narrative (s.3) describes verify-on-action, webhook, and reconciliation. This is technically accurate. Counsel should confirm the level of detail is right for a public-facing doc (we err on the side of transparency).
2. Partial refunds (s.5) are not supported in the product today. Counsel should confirm the explicit statement is preferable to silence.
3. Chargeback language (s.8) discourages chargebacks. Some jurisdictions consider language that "discourages" a consumer protection right problematic; confirm the wording is permissible in our markets.
4. Platform fee refund treatment (s.6) is currently "nothing to retain". Once GA pricing is set, this section will need a rewrite.

### Organizer Agreement

1. The controller-processor framing (s.7) is the basis for our DPA. Counsel should confirm the framing is accurate (Organizer is Controller for attendance data; Orkora is Processor for attendance data; Orkora is Controller for account data).
2. The abuse-takedown SLA (s.6) is a public commitment. Confirm we have the ops capacity (acknowledge 1 business day, complete review 3 business days).
3. The chargeback-rate threshold (s.10) is 1% of net transactions over a rolling 30-day window. This is the Visa/Mastercard "Excessive Chargeback Threshold". Confirm we can monitor and enforce this.
4. The marketing-comms rules (s.11) require Organizer to collect consent for marketing email. This may conflict with how some Organizers currently operate. Counsel should confirm the rule is enforceable and not over-restrictive.
5. The KYC threshold (s.1) and the indemnity (s.14) are the financial-exposure clauses. Confirm both are appropriate given our insurance posture.

---

## 4. Technical evidence underpinning the docs

These are the artifacts counsel can reference if they want to verify a claim.

- **`SECURITY_REVIEW_2026-05-30.md`** — full security review, including the three dry-run findings (signup password in URL, raw error message leak, expired Stripe key) and the addendum 14 findings (ticket lifecycle decoupling, missing refund email, duplicate orders). Every fix is shipped and tested.
- **`apps/api/src/modules/payments/payments.service.ts`** — refund settlement code. `refundOrder()` is the entry point. `markOrderRefunded()` is the idempotent finisher; reads the order, voids the tickets, inserts a `notification_log (orderId, kind=refund)` row inside the same transaction as the order flip, and sends the refund email exactly once.
- **`apps/api/migrations/0004_ticket_order_link_and_refund.sql`** — the migration that introduces `tickets.order_id` and `notification_log`. The comment block at the top of the file explains the legal-relevant change in plain language.
- **`apps/api/src/modules/auth/auth.service.ts`** — refresh-token rotation, reuse detection, and per-account exponential backoff. The basis for the Privacy Policy's section 10 security claims.
- **`apps/api/prisma/schema.prisma`** — the canonical data model. Every field in the data the Privacy Policy describes appears here.

---

## 5. Operational readiness checklist (pre-launch)

These are operational steps that must precede or accompany the legal-review sign-off. They are listed here so counsel and the operator share one punch list.

- [ ] Real entity registered with companies registry; registration number on hand.
- [ ] Registered address confirmed.
- [ ] Email aliases resolve: `hello@`, `security@`, `privacy@`, `support@`, `abuse@`, `dpo@`.
- [ ] DPO appointed (named individual or contracted DPO-as-a-service).
- [ ] EU representative appointed if we admit EU residents at launch.
- [ ] SPF, DKIM, and DMARC records published on the new domain.
- [ ] DPA template drafted (or a decision recorded that the Privacy Policy sub-processor table is sufficient).
- [ ] Trust & Safety inbox monitored, abuse SLA committed to internally.
- [ ] Insurance posture confirmed (E&O, cyber).
- [ ] Bank-account-ownership verification flow for organizers in place.

---

## 6. Document map

- `apps/web/app/legal/terms/page.tsx` — Terms of Service
- `apps/web/app/legal/privacy/page.tsx` — Privacy Policy
- `apps/web/app/legal/refunds/page.tsx` — Refund Policy
- `apps/web/app/legal/organizer/page.tsx` — Organizer Agreement
- `apps/web/app/legal/layout.tsx` — Shared wrapper, draft-notice banner, contact footer

Counsel can review the rendered pages at `/legal/terms`, `/legal/privacy`, `/legal/refunds`, and `/legal/organizer` on the live site, or read the source TSX files directly.

---

## 7. Sign-off

When counsel is satisfied, the launch sequence is:

1. Remove the `COUNSEL REVIEW CHECKLIST` comment block from the top of each file.
2. Remove the draft-notice banner from `apps/web/app/legal/layout.tsx` (the rose-coloured strip at the top of every legal page).
3. Set `LAST_UPDATED` to the sign-off date in each file.
4. Push, deploy, point the domain.
