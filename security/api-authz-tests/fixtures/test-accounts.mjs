/**
 * Test-account harness.
 *
 * Loads two pre-provisioned users (A + B) from the audit config and
 * exchanges their email/password for access tokens via the API's
 * /v1/auth/login endpoint. Tokens are cached for the lifetime of the
 * process.
 *
 * The setup script under apps/api/scripts/seed-security-test-accounts.ts
 * (manual; see SECURITY_AUDIT.md) creates the accounts in different
 * orgs so cross-tenant tests have something to attack.
 */

import { loadConfig } from '../../scripts/common.mjs';

let cached = null;

export async function getFixtures() {
  if (cached) return cached;

  const cfg = await loadConfig();
  const apiBaseUrl = cfg.apiBaseUrl;
  if (!apiBaseUrl) {
    throw new Error(
      'apiBaseUrl is not configured. Set API_BASE_URL in env or write a security-audit.config.json.',
    );
  }

  const a = cfg.testAccounts?.userA ?? {};
  const b = cfg.testAccounts?.userB ?? {};
  for (const [label, acct] of [['userA', a], ['userB', b]]) {
    if (!acct.email || !acct.password) {
      throw new Error(
        `${label} email/password not configured. Set SEC_${label.toUpperCase()}_EMAIL and SEC_${label.toUpperCase()}_PASSWORD.`,
      );
    }
  }

  const [tokenA, tokenB] = await Promise.all([
    login(apiBaseUrl, a.email, a.password),
    login(apiBaseUrl, b.email, b.password),
  ]);

  cached = {
    apiBaseUrl,
    appBaseUrl: cfg.appBaseUrl,
    endpoints: cfg.endpoints ?? {},
    userA: { ...a, token: tokenA },
    userB: { ...b, token: tokenB },
  };
  return cached;
}

async function login(apiBaseUrl, email, password) {
  const r = await fetch(joinUrl(apiBaseUrl, '/v1/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Login failed for ${email} (${r.status}): ${text.slice(0, 200)}`);
  }
  const bundle = await r.json();
  if (!bundle.accessToken) {
    throw new Error(`Login for ${email} returned no accessToken: ${JSON.stringify(bundle).slice(0, 200)}`);
  }
  return bundle.accessToken;
}

export function joinUrl(base, path) {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function req(base, method, path, { token, body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(joinUrl(base, path), init);
  let parsed = null;
  try {
    parsed = await r.json();
  } catch {
    /* not json */
  }
  return { status: r.status, body: parsed, headers: r.headers };
}

/**
 * Result aggregator shared by all spec files. Each spec pushes
 * `recordResult({...})` and the orchestrator writes the merged file
 * after all specs complete.
 */
const results = [];
export function recordResult(result) {
  results.push(result);
}
export function readResults() {
  return results.slice();
}
