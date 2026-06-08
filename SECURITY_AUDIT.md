# Security audit harness

This repository ships an automated security testing + CI harness. It runs the same checks locally and in GitHub Actions, writes machine + human reports under `security/reports/`, and gates CI on the strict ones.

The harness layers on top of, not replaces, the security review and fix work documented in `SECURITY_REVIEW.md` and `SECURITY_REVIEW_2026-05-30.md`. The reviews capture what was investigated and fixed once; this harness re-runs the relevant checks on every build so regressions are caught at PR time.

## What gets checked

Each row corresponds to one runnable script under `security/scripts/` and one job in `.github/workflows/security.yml`. CI uploads the corresponding report directory as a workflow artefact.

| Area | Script | What it does | Gate |
|---|---|---|---|
| Dependency CVEs | `check-deps.mjs` | Runs `pnpm audit --prod` and optionally Snyk (`SNYK_TOKEN`). Deduplicates by advisory id. | HIGH+CRITICAL above threshold fails CI. |
| Secrets | `check-secrets.mjs` | TruffleHog against working tree + full git history; ggshield (GitGuardian) if `GITGUARDIAN_API_KEY`. | Any verified secret fails CI. |
| Browser bundle leaks | `check-bundle-leaks.mjs` | Builds `apps/web` and greps `.next/static/**` + build manifests for patterns that should never reach the client. | Any pattern match fails CI. |
| Transport posture | `check-transport.mjs` | HTTPS, HTTP-to-HTTPS redirect, HSTS, secure cookie flags on the configured app + API hosts. | HIGH findings fail CI (skipped if no URL configured). |
| API authorization | `run-api-authz.mjs` | Cross-user IDOR, cross-tenant access, payload mutation, role escalation, admin-endpoint protection, unchecked params, expired/forged/`alg=none` JWTs, unauthenticated access to protected endpoints. | Any test failure fails CI (only runs when test-account env vars are present). |
| OWASP ZAP | `run-zap.mjs` | Dockerised ZAP baseline (passive) scan against `SECURITY_TARGET_URL`. Refuses active scans against production unless `ALLOW_PROD_ZAP=1`. | HIGH > 0 or MEDIUM > 5 fails CI. |
| Aggregate | `run-all.mjs` | Runs every script and writes `security/reports/aggregate/latest.json`. | Fails if any required step failed. |

## OWASP Top 10 coverage map

| OWASP Top 10 (2021) | Where it is covered |
|---|---|
| A01 Broken Access Control | `run-api-authz.mjs` (BOLA/IDOR + tenant + role + admin) + existing tenancy isolation tests under `apps/api/src/**/*.spec.ts`. |
| A02 Cryptographic Failures | `check-transport.mjs` (HTTPS + HSTS + cookie flags) + JWT key-rotation runbook in `DEPLOY.md`. |
| A03 Injection | `run-api-authz.mjs` (`06-unchecked-params.test.mjs`) + Prisma's parameterised queries (audited in `SECURITY_REVIEW_2026-05-30.md` Finding 1.1). |
| A04 Insecure Design | Manual: see `SECURITY_REVIEW_*.md`. |
| A05 Security Misconfiguration | `check-transport.mjs`, ZAP baseline, `check-bundle-leaks.mjs`. |
| A06 Vulnerable & Outdated Components | `check-deps.mjs` (pnpm audit + Snyk). |
| A07 Identification & Authentication Failures | `run-api-authz.mjs` (`02-invalid-tokens.test.mjs`) + per-account login backoff specs under `apps/api/src/modules/auth/`. |
| A08 Software & Data Integrity Failures | `check-secrets.mjs` (TruffleHog history) + dependency audit + signed JWT (RS256, kid rotation). |
| A09 Security Logging & Monitoring Failures | Manual: confirm Sentry DSN, audit log table coverage, alerting (see `OUTSTANDING.md`). |
| A10 Server-Side Request Forgery (SSRF) | Manual: this app has limited outbound HTTP and no user-supplied URL fetching surface. Re-audit if/when added. |

## Database-level access controls (RLS equivalent)

Orkora uses Prisma + Postgres directly rather than Supabase; there is no row-level-security policy file to lint. The equivalent gate is **server-side authorization in the API layer**, which is covered by:

- `apps/api/src/common/interceptors/tenancy.interceptor.ts` (rejected `$executeRawUnsafe` interpolation; see `SECURITY_REVIEW_2026-05-30.md` Finding 1.1)
- per-service `WHERE organizationId =` clauses on every list/detail query
- existing Jest tests in `apps/api/src/**/*.spec.ts` that pin those clauses
- new `run-api-authz.mjs` integration tests that exercise the live API surface

If a future migration ever switches to Postgres RLS, add policy-lint script under `security/scripts/check-rls.mjs` and a corresponding job in the workflow.

## How to run

### One command, full audit

```bash
# Local; requires Docker for ZAP, optional TruffleHog binary
pnpm security:all
```

Outputs roll up under `security/reports/aggregate/latest.json` + `latest.md`.

### CI-flavoured run (skips ZAP)

```bash
pnpm security:ci
```

Mirrors what GitHub Actions runs on every push/PR. Doesn't require Docker.

### Individual checks

```bash
pnpm security:deps        # dependency CVE audit
pnpm security:secrets     # TruffleHog + optional ggshield
pnpm security:bundle      # build apps/web, grep for leaked secrets
pnpm security:transport   # HTTPS/HSTS/cookies (needs APP_BASE_URL / API_BASE_URL)
pnpm security:api         # API authz abuse tests (needs test-account env vars)
pnpm security:zap         # OWASP ZAP baseline (needs Docker + SECURITY_TARGET_URL)
```

### Configuration

Copy the example and edit:

```bash
cp security/security-audit.config.example.json security/security-audit.config.json
```

The live file is gitignored. All sensitive fields use `env:VAR_NAME` placeholders that the runner resolves at run time.

### Required environment

| Variable | Used by | Notes |
|---|---|---|
| `APP_BASE_URL` | transport, ZAP | e.g. `https://staging.orkora.events`. |
| `API_BASE_URL` | api-authz, transport | e.g. `https://staging-api.orkora.events`. |
| `SEC_USER_A_EMAIL`, `SEC_USER_A_PASSWORD`, `SEC_USER_A_ID`, `SEC_ORG_A_ID` | api-authz | Pre-provisioned non-admin test user in Org A. |
| `SEC_USER_B_EMAIL`, `SEC_USER_B_PASSWORD`, `SEC_USER_B_ID`, `SEC_ORG_B_ID` | api-authz | Pre-provisioned non-admin test user in **Org B** (disjoint from Org A). |
| `SECURITY_TARGET_URL` | ZAP, transport (CI) | Single URL the ZAP scan targets. Set as a repo variable in GitHub. |
| `ZAP_MODE` | ZAP | `baseline` (default, safe) or `full` (active, never on production). |
| `ALLOW_PROD_ZAP` | ZAP | Set to `1` only with an explicit operator decision to run active scans on the production hostname. |
| `SNYK_TOKEN` | deps | Optional. If absent, falls back to pnpm audit only. |
| `GITGUARDIAN_API_KEY` | secrets | Optional. If absent, falls back to TruffleHog only. |

### Provisioning the test accounts

Manual one-off:

1. In your staging environment, create two organizations: `Acme A Test` and `Acme B Test`. They must not share memberships.
2. Create a user in each org with a known password. Both users should have the default (non-admin) platform role.
3. Note each user's UUID + email + password + org UUID.
4. Add the values to your shell env (local) or repo secrets (CI):

```bash
export SEC_USER_A_EMAIL="user-a@orkora-sectest.example"
export SEC_USER_A_PASSWORD="..."
export SEC_USER_A_ID="<uuid>"
export SEC_ORG_A_ID="<uuid>"
# repeat for B
```

If those env vars are missing in CI, the `test-api-authz` job is skipped (not failed). This keeps the workflow green for contributors who don't have staging access.

## Reading the reports

Each script writes both JSON and Markdown into `security/reports/<area>/`. Two files always reflect the latest run: `latest.json` + `latest.md`. Historical runs are archived as `report-<ISO timestamp>.json`/`.md` so you can diff a regression against last week's clean run.

Aggregate report at `security/reports/aggregate/latest.md` has a per-step status table.

### Pass/fail decision flow

```
deps        -> HIGH/CRITICAL above threshold? FAIL
secrets     -> any verified secret? FAIL
bundle      -> any leak pattern matched? FAIL
api         -> any abuse test failed? FAIL
transport   -> any HIGH finding (and SECURITY_TARGET_URL set)? FAIL
zap         -> HIGH > 0 or MEDIUM > zap_medium threshold? FAIL
aggregate   -> any required step failed? FAIL
```

In CI, each gate is enforced by the corresponding job exit code. A job that is skipped (e.g. no `SECURITY_TARGET_URL` set) is not a failure.

## Operator playbook

### When deps audit fails

1. Open the workflow log; the job summary lists advisory IDs.
2. Run `pnpm audit --json` locally for full detail.
3. For a direct dep: bump the version and retest.
4. For a transitive dep: add a `pnpm.overrides` entry in the root `package.json` to force a patched version, OR document a justified false positive in `SECURITY_REVIEW.md` and bump the threshold consciously.

### When secrets scan fails

1. The report lists the file + line for each verified secret.
2. **Rotate the leaked credential immediately** (the moment a verified hit lands in CI, treat the credential as known-public).
3. Remove from the working tree.
4. Purge from git history if the secret was ever committed (e.g. `git filter-repo --invert-paths --path <file>` then force-push, plus notify any forks).
5. Document in `SECURITY_REVIEW.md`.

### When bundle leak fails

1. Find the matching pattern in `apps/web/components/` or `apps/web/lib/`.
2. Move the value to a server-only call (Server Component, Route Handler, or API call).
3. If the value MUST be in the browser, confirm it is a public token and add a `// nosec: PUBLIC_*` comment beside it; consider also moving the pattern off the harness's allowlist.

### When API authz fails

1. The TAP output names each failed assertion + the offending HTTP status.
2. Inspect the corresponding endpoint:
   - For cross-tenant 200s: confirm the service-level `WHERE organizationId =` clause is present and that the request reached the user-scoped controller, not an admin one.
   - For payload-mutation 200s on profile/checkout: confirm the controller derives the user from the JWT, not from the request body.
3. Reproduce locally with `curl` against the API using the two test tokens.
4. Add a unit test under `apps/api/src/**/*.spec.ts` to pin the fix.

### When ZAP fails

1. Open `security/reports/zap/latest.html` for the visual report.
2. Investigate each HIGH alert. Common ones for this app: missing security headers (already mostly fixed via helmet + middleware), CSP issues (see `apps/web/middleware.ts`), cookie flag issues (see `apps/api/src/modules/auth/auth.controller.ts`).
3. Re-run `pnpm security:zap` after the fix lands on staging.

## Production safety rules

- **Never run ZAP in `full` mode against the production hostname.** The script refuses unless `ALLOW_PROD_ZAP=1`. Active scans send mutating requests; they can create test data, exhaust rate limits, and trip alerting.
- **Never set `ALLOW_PROD_ZAP=1` casually.** If you have a legitimate need, schedule a window, notify the team, and clean up afterwards.
- **Secrets scanning runs against full git history.** If you accidentally commit a real secret, even rotating + scrubbing the working tree leaves the bad object in history. Use `git filter-repo` to purge.
- **Test accounts are real accounts.** Don't grant them admin role. Don't reuse the passwords elsewhere. Rotate after every offboarding.

## Limitations + manual checks still needed

Automated coverage stops at the surface the harness can reach. The following items need periodic manual review (documented in `SECURITY_REVIEW.md`):

- **A04 Insecure Design** — threat model walk-through per major feature.
- **A09 Logging & Monitoring** — confirm Sentry DSN is set in prod, alerting works (drop a synthetic 500 and watch for the page).
- **A10 SSRF** — re-audit if the API ever fetches user-supplied URLs (e.g. webhook URL validation, image proxying).
- **Browser console for `service_role`-style leaks in DEV mode** — Next.js dev mode bundles can include data that production tree-shakes out. Spot-check `pnpm --filter @orkora/web dev` periodically.
- **Mobile (Expo) app** — out of scope for this harness. The PWA install path on iOS/Android shares the web SW + manifest; review separately when shipping native release builds.
- **Stripe / Paystack / Flutterwave webhook signature verification** — covered by per-provider tests under `apps/api/src/modules/payments/providers/*.spec.ts`, not duplicated here.

## File map

```
.github/workflows/security.yml          CI workflow with 6 jobs
package.json                            7 new `security:*` scripts
SECURITY_AUDIT.md                       this file
security/
  security-audit.config.example.json    tracked, copy to .json
  security-audit.config.json            gitignored, your local override
  scripts/
    common.mjs                          shared helpers (loadConfig, writeReport)
    check-deps.mjs                      pnpm audit + Snyk
    check-secrets.mjs                   TruffleHog + ggshield
    check-bundle-leaks.mjs              .next/static grep
    check-transport.mjs                 HTTPS/HSTS/cookies
    run-api-authz.mjs                   driver for node --test
    run-zap.mjs                         dockerised ZAP
    run-all.mjs                         orchestrator
  api-authz-tests/
    fixtures/test-accounts.mjs          token exchange + req helper
    tests/
      01-unauthenticated.test.mjs
      02-invalid-tokens.test.mjs
      03-cross-tenant.test.mjs
      04-payload-mutation.test.mjs
      05-admin-access.test.mjs
      06-unchecked-params.test.mjs
  reports/                              gitignored except .gitkeep
    {zap, dependencies, secrets, transport, api-authz, bundle, aggregate}/
```

## Re-using on a new repo

The harness is intentionally framework-agnostic except for the bundle scanner (which knows `.next`) and the API authz suite (which expects a NestJS-style auth/login + organization-scoped endpoints). To adapt:

1. Update `security/security-audit.config.example.json`: paths to the build output, endpoint lists, leak patterns.
2. Update `check-bundle-leaks.mjs` `NEXT_DIR` constant or replace with the new framework's output dir.
3. Update `fixtures/test-accounts.mjs` `/v1/auth/login` path to whatever the new API uses.
4. The rest (deps, secrets, transport, ZAP) is a drop-in.
