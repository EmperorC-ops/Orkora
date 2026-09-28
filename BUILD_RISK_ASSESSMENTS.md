# Build Risk Assessments

Two reusable checklists to run against any web/app build, derived from two common
"your app will get sued / hacked" claim lists. Each item states what it is, how to
detect it (static search plus a dynamic test), the pass bar, a severity, and the
fix. The greps are examples for JavaScript/TypeScript stacks; adapt the patterns
to the language in front of you. Nothing here is legal advice; the compliance
items are for you and counsel.

How to use: for each item, run the detection, record PASS / FAIL / N/A with the
evidence (file:line or request/response), then triage the FAILs by severity.

---

## Assessment A: Compliance and "per-incident" legal exposure

Theme: fines that scale per user, per email, or per session rather than per sale.

### A1. Age gating and minors
- Risk: collecting data from children (under 13 US COPPA, under 16 in parts of the
  EU) without consent, or no stated minimum age.
- Detect (static): search the signup/registration form and its DTO for an age or
  date-of-birth field, and search the Terms/Privacy for a minimum-age clause.
  - `rg -i "age|birth|dob|date of birth" <signup form> <auth dto>`
  - `rg -i "at least [0-9]+ years|minimum age|under 13|16 years" <legal>`
- Detect (dynamic): complete signup with no age given; see if it is accepted.
- Pass: either the service is clearly not child-directed AND the Terms set a
  minimum age users must accept, or the signup collects and enforces age.
- Severity: low to medium (higher if the product is consumer or youth-facing).
- Fix: add a minimum-age clause to the Terms and a visible acknowledgment at
  signup; if you knowingly serve under-13s, implement verifiable parental consent.

### A2. Third-party fonts, scripts, and assets that leak visitor IPs
- Risk: loading fonts or scripts from third-party servers (Google Fonts, CDNs,
  trackers) sends every visitor's IP to that third party, which EU courts have
  treated as a personal-data transfer without consent.
- Detect (static):
  - `rg -i "fonts.googleapis|fonts.gstatic|next/font/google|@import url\(|cdn\.|googletagmanager|google-analytics"`
  - Read the CSP: check `font-src`, `script-src`, `connect-src`, `img-src` for
    third-party origins.
- Detect (dynamic): load a page with the network tab open and list every external
  origin requested before consent. Any non-first-party font/tracker is a finding.
- Pass: fonts and critical assets are self-hosted; no third-party request fires
  before consent; trackers load only after opt-in.
- Severity: low to medium (medium if EU visitors and no consent banner).
- Fix: self-host fonts, gate trackers behind consent, and tighten CSP to your own
  origins.

### A3. Session replay and keystroke capture (wiretapping / CIPA)
- Risk: tools that record keystrokes, mouse, and form input (session replay) can
  be treated as wiretapping under California CIPA and similar, especially on pages
  with personal or payment data.
- Detect (static):
  - `rg -i "rrweb|hotjar|fullstory|logrocket|mouseflow|smartlook|clarity|session.?replay"`
  - `rg -i "addEventListener\(['\"]key(down|press|up)|record\(" <client>` and check
    whether any handler streams input to a server.
- Detect (dynamic): with the network tab open, type into a form and watch for
  requests carrying keystroke or DOM-mutation payloads.
- Pass: no replay/keystroke libraries; analytics is aggregate and first-party;
  input fields on sensitive pages are masked if any replay exists.
- Severity: medium to high where replay is on by default over PII/payment pages.
- Fix: remove replay, or disable it on sensitive pages and mask all inputs, and
  disclose plus get consent.

### A4. Marketing email compliance (CAN-SPAM, CASL)
- Risk: commercial email without a working unsubscribe and a valid physical postal
  address, or sent without consent.
- Detect (static): open the marketing/campaign email template (not transactional
  receipts, which are exempt) and confirm the footer has both:
  - an unsubscribe link (ideally one-click, honored fast), and
  - a physical postal mailing address.
  - `rg -i "unsubscribe|list-unsubscribe|postal|address|physical" <email templates>`
- Detect (dynamic): send yourself a campaign; click unsubscribe and confirm it
  stops mail; check the rendered footer for the address.
- Pass: every commercial email has a functioning unsubscribe AND a postal address;
  suppression is honored promptly; recipients consented.
- Severity: medium (fines are per email).
- Fix: add the postal address to the template footer, keep the unsubscribe, and
  suppress on opt-out. Keep proof of consent.

### A5. Auto-renewal and subscription disclosure
- Risk: recurring charges without clear renewal terms next to the purchase button
  and an easy cancel path (California ARL, FTC click-to-cancel).
- Detect (static):
  - `rg -i "subscription|recurring|auto.?renew|mode: ?['\"]subscription|price_.*recurring"`
  - If found, inspect the checkout UI for renewal price, cadence, and cancel steps
    shown before purchase.
- Detect (dynamic): go through the purchase flow; confirm the renewal terms are
  visible at the point of consent and that cancel is as easy as signup.
- Pass: no recurring product, OR renewal terms are disclosed adjacent to the
  button, affirmative consent is captured, and cancel is self-service.
- Severity: medium to high for consumer subscriptions.
- Fix: put renewal price/cadence next to the button, capture explicit consent,
  send a renewal reminder, and offer online cancel.

### A6. User-generated content and DMCA safe harbor
- Risk: hosting user uploads (avatars, images, files) without a registered DMCA
  agent and a takedown process removes your safe-harbor defense for infringing
  content (US).
- Detect (static): confirm the app accepts user uploads (`rg -i "upload|avatar|presign|multipart"`)
  and that a takedown/copyright policy page exists (`rg -i "dmca|takedown|copyright agent"`).
- Detect (operational): check whether a DMCA agent is registered with the US
  Copyright Office.
- Pass: either no user uploads, or a registered DMCA agent plus a published
  notice-and-takedown policy and a working reporting channel.
- Severity: low to medium (US-centric; higher with US traffic).
- Fix: register the agent, publish the policy and a report route, and act on
  notices.

### A-bonus (commonly missed, same theme)
- Cookie/tracker consent banner before non-essential cookies fire (ePrivacy).
- Privacy Policy and Terms actually linked and current.
- Data access/deletion request path (GDPR/CCPA).
- Accessibility baseline (ADA/WCAG) to reduce demand-letter exposure.

---

## Assessment B: API and authorization security

Theme: extracting other users' data purely through API requests. The chain in the
source video was: map the API, predict identifiers, read other users' objects
(BOLA), then escalate via mass assignment.

### B1. Predictable or enumerable identifiers
- Risk: IDs an attacker can guess or regenerate (sequential integers, timestamp or
  user-seeded "random", weak UUIDs) let them enumerate resources.
- Detect (static):
  - Database IDs: `rg -i "autoincrement|serial|uuid|uuidv4|uuidv7|gen_random|random\(\)|uuid4"`
  - Confirm the random source is a CSPRNG (for example `crypto.randomBytes`,
    `gen_random_bytes`, `secrets`) and NOT a seeded PRNG (`Math.random`, Python
    `random` seeded by time or user id).
- Detect (dynamic): register several accounts quickly; collect their ids; check for
  sequential order, shared prefixes, or a recoverable seed. Try incrementing or
  regenerating to hit a neighbor.
- Pass: identifiers used in URLs/API are non-sequential and backed by a CSPRNG, so
  they cannot be predicted from other ids or timestamps.
- Severity: high when combined with any object-level authz gap.
- Fix: use random UUIDv4, or UUIDv7 whose random bits come from a CSPRNG, or opaque
  random tokens; never expose sequential ids, and never seed the RNG.

### B2. Broken Object Level Authorization (BOLA / IDOR)
- Risk: the server checks that you are authenticated but not that the object you
  request belongs to you (or your tenant/org).
- Detect (static): for each resource endpoint, confirm the query is scoped to the
  caller, not just by id.
  - Look for `findUnique({ where: { id } })` with no owner/tenant filter (weak) vs
    `findFirst({ where: { id, organizationId } })` or an explicit ownership check.
- Detect (dynamic): with account A's token, request account B's object ids
  (`GET /resource/{B_id}`). Do this for every object type, and for nested tenant
  data. A 200 with B's data is a fail; expect 403/404.
- Pass: every object read/write verifies ownership or tenant membership, not just a
  valid token.
- Severity: critical.
- Fix: scope every query by the authenticated principal's owner/tenant id, and add
  a regression test per endpoint.

### B3. Broken Function Level Authorization (role/privilege checks)
- Risk: privileged actions (admin routes, other tenants' management) reachable by a
  normal user because the route lacks a role check.
- Detect (static): confirm admin/elevated routes carry a role guard, not just an
  auth guard. `rg -i "roles?\(|@Roles|requireRole|isAdmin|guard"`.
- Detect (dynamic): with a low-privilege token, call admin and cross-tenant
  endpoints. Any success is a fail.
- Pass: every privileged route enforces the required role server-side.
- Severity: critical.
- Fix: add role guards on all privileged handlers; default-deny.

### B4. Mass assignment / over-posting
- Risk: an update endpoint accepts fields it should not (for example `role`,
  `isAdmin`, `tenantId`, `balance`), letting a user escalate by adding them to the
  request body.
- Detect (static): confirm inputs are validated against an allowlist (a schema/DTO)
  and unknown fields are rejected or stripped.
  - `rg -i "whitelist|forbidNonWhitelisted|strict\(\)|z.object|pick\(|omit\("` for
    allowlisting; look for raw `update({ data: req.body })` spreads as red flags.
- Detect (dynamic): send an update with an extra privileged field
  (`{"role":"admin"}`) and check whether it is applied or rejected.
- Pass: unknown/protected fields are rejected or ignored; role/tenant fields are
  only settable through dedicated, guarded endpoints.
- Severity: critical (this is the escalation step).
- Fix: validate every body against a strict allowlist; never bind the raw body to a
  persistence model; keep sensitive fields off the input schema.

### B5. Supporting checks the attack relied on
- API discovery: assume every endpoint is discoverable (proxy the app through
  Burp/ZAP). Do not rely on obscurity.
- JWT handling: verify signature and algorithm server-side, reject `alg: none`,
  scope claims to the user; do not trust ids from the token body for authorization
  without an ownership check.
- Rate limiting: throttle auth, registration, and id-enumeration endpoints so bulk
  guessing is impractical; watch for unthrottled loops.
- Error and response hygiene: do not leak internal ids, stack traces, or other
  users' fields in responses.

### How to run Assessment B in practice
1. Proxy the app (Burp Suite or OWASP ZAP) and browse to map endpoints.
2. Register two or three accounts; capture their ids and tokens.
3. Test B1 (predict/enumerate ids), then B2 (read across accounts), then B3
   (privileged routes), then B4 (over-post a privileged field).
4. If you have an automated authz test suite, run it and treat any cross-account
   200 as a failing test to fix before launch.

---

## Scoring

For each assessment, mark every item PASS / FAIL / N/A with evidence. Any critical
FAIL (B2, B3, B4) is a launch blocker. Compliance FAILs (A4, A5, A6) are fixed
before you send marketing mail, take recurring payments, or host user uploads,
respectively.
