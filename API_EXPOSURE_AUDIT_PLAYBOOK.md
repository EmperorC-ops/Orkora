# Public API Data-Exposure Audit — Portable Playbook

A stack-agnostic procedure for finding and fixing endpoints that over-return
data to unauthenticated (or under-scoped) callers. Re-run this per platform.
The *method* is identical everywhere; the *fixes* are adapted to each stack.

Principle: **an endpoint should return the minimum the client needs, and never
more to an anonymous caller than to an authenticated owner.** Unfiltered
responses leak PII/secrets and signal low engineering maturity to technical
buyers.

---

## Step 1 — Enumerate the unauthenticated surface

List every route handler that is NOT behind an auth guard/middleware, and map
each to the function that shapes its response. "Unauthenticated" includes
soft-auth endpoints that rely on a bearer id/token in the URL or a signature in
the body rather than a session.

How to find them, by stack:

- **NestJS:** grep for `@Controller`, `@Get/@Post/...`, and `@UseGuards`. A
  route is public if neither its method nor its controller class has an auth
  guard (`AuthGuard('jwt')` or equivalent). Watch for composite guards.
- **Express/Koa/Fastify:** map the router tree; note which routers have
  `authMiddleware` mounted and which handlers sit outside it.
- **Django REST Framework:** check each view's `permission_classes`
  (`AllowAny` = public). Also project-level `DEFAULT_PERMISSION_CLASSES`.
- **Rails:** find controllers without `before_action :authenticate_*`, and
  `skip_before_action` overrides.
- **Go (net/http, chi, gin, echo):** which handlers are registered outside the
  auth middleware group.
- **GraphQL:** every field resolver reachable without an auth directive; the
  "endpoint" is the type/field, not the URL.

Produce a table: `method | path | guard (or none) | handler → serializer`.
Flag the ungated rows. Note any custom/soft auth (webhook signature, HMAC in a
query param, bearer id in the URL) explicitly.

---

## Step 2 — Inspect each public response shape

For every public serializer, ask what actually leaves the building. Flag:

- **PII:** email, phone, full name where not required, physical/billing address,
  IP, government/tax ids, date of birth.
- **Secrets / credentials:** API keys, tokens, signed QR/check-in tokens,
  password hashes, provider refs, webhook secrets, internal signed URLs that
  don't expire.
- **Internal identifiers:** primary keys / user ids that aren't needed by the
  client, especially sequential/enumerable ones (they enable scraping and
  cross-record correlation).
- **Unneeded relations:** whole nested objects returned "because the ORM had
  them loaded" (e.g. `include`/`select *`, `.includes`, eager loads,
  `select_related`).
- **Over-broad fields:** returning the entire DB row (`SELECT *`,
  `Model.objects.all().values()`, `return entity`) instead of an explicit
  projection.
- **Owner-vs-public mismatch:** the same serializer used for both the
  authenticated owner and an anonymous caller, leaking owner-only fields to the
  public path.

---

## Step 3 — Decide the fix per finding

Use these rules:

- **Not needed by any client → remove it** from the response (drop the field /
  narrow the projection).
- **Needed by the owner but not the public → split the serializer.** Keep the
  full field on the authenticated path; return a reduced/masked version on the
  public one. (e.g. mask email `j***@domain.com`.)
- **A bearer id/token in the URL is the credential → keep the token, but ensure
  the id is unguessable** (crypto-random, ≥ ~64 bits of entropy; never
  sequential). If it's sequential, that's a separate high-severity finding.
- **Sequential internal ids exposed → replace with a random public id / slug**,
  or remove them if the client doesn't need them.
- **Soft-auth (webhook/HMAC) → verify it fails closed**, not open, when the
  secret is missing or misconfigured.

Severity guide: full PII to anonymous = High; internal user ids / bearer-token
on a strong-random id = Medium; uuid primary keys with no PII = Low/accept.

---

## Step 4 — Apply the fixes (stack-specific)

- Replace `return entity` / `SELECT *` with an explicit allow-list projection.
- Split shared serializers into `publicX()` and `ownerX()` variants.
- Narrow ORM `select`/`include` on public reads to only what the response uses.
- Add a masking helper for fields shown to a bearer holder (email, partial name).
- Make webhook/HMAC guards reject when the secret is unset.

Keep the diff surgical; don't change authenticated/owner paths unless they leak.

---

## Step 5 — Verify and prevent regression

- Re-read each changed public response and confirm the removed field is gone and
  the client still has what it needs.
- **Add response-shape contract tests for the public endpoints** — assert the
  exact key set returned. This is the durable guard: a future eager-load or
  `include` change then fails the test instead of silently re-leaking.
- Adopt **API versioning** (`/v1`) if not already present, so you can change
  shapes later without breaking integrators — the audit is easier to enforce
  when versions are explicit.

---

## Per-endpoint checklist (copy per row)

| Path | Public? | Returns PII? | Returns secret/token? | Internal/seq id? | Unneeded relation? | Verdict | Fix |
|------|---------|--------------|-----------------------|------------------|--------------------|---------|-----|

Verdicts: `accept` / `mask` / `drop-field` / `split-serializer` / `randomize-id`
/ `fail-closed`.

---

## Ready-to-run prompt (paste into a repo session)

> Audit this codebase for public API data exposure. (1) Enumerate every HTTP
> route (or GraphQL field) NOT behind authentication, and map each to the code
> that shapes its response — give me a table of `path | guard | handler`. (2)
> For each public response, flag any PII (email/phone/address), secrets or
> tokens, internal/sequential ids, unneeded nested relations, or whole-row
> returns. (3) For each real finding, propose the minimal fix: drop the field,
> split the owner vs public serializer (mask on the public one), randomize a
> sequential id, or make a soft-auth guard fail closed. (4) Apply the fixes,
> keeping authenticated/owner paths intact, then add response-shape contract
> tests for the public endpoints. Produce a short findings report grouped into
> Fixed / Accepted-as-designed / Recommended follow-ups.

---

## Reference: Orkora pass (2026-07-25)

Findings from applying this to the Orkora API (NestJS + Prisma):
- Public ticket-by-code endpoint returned the holder's full email → masked
  (owner keeps full via the authenticated `/me` path).
- Public live chat / Q&A returned each author's internal user id → dropped
  (name + avatar only).
- Accepted: QR token on a 10-char crypto-random bearer code; order-status by
  uuid; uuidv7 primary keys with no PII; signature-verified payment webhooks.
- Follow-ups: make the Postmark webhook guard fail closed; add public
  response-shape contract tests.
