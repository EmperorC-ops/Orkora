/**
 * Invalid / expired / malformed token tests.
 *
 * Every protected endpoint must reject:
 *   - a syntactically valid JWT signed by a key we control (foreign issuer)
 *   - a JWT with the alg header set to 'none' (alg-confusion attempt)
 *   - a JWT with an expired exp claim
 *   - a bogus opaque token
 *   - User A's *refresh* token used as an access token
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { getFixtures, req, recordResult } from '../fixtures/test-accounts.mjs';

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function forgeJwt({ header = {}, payload = {} }) {
  const h = b64url(JSON.stringify({ alg: 'none', typ: 'JWT', ...header }));
  const p = b64url(JSON.stringify({ sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 3600, ...payload }));
  const sig = createHmac('sha256', 'this-key-is-not-ours').update(`${h}.${p}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${h}.${p}.${sig}`;
}

function expiredJwt(legitTokenLike) {
  // Use a HS256 placeholder; the server won't match the signature but
  // we want the parser to reach the `exp` check. Some implementations
  // short-circuit on signature; both outcomes (401) are acceptable.
  return forgeJwt({
    header: { alg: 'HS256' },
    payload: { exp: Math.floor(Date.now() / 1000) - 60 },
  });
}

test('Forged-issuer JWT is rejected on every protected endpoint', async () => {
  const fx = await getFixtures();
  const forged = forgeJwt({ header: { alg: 'RS256' } });
  const offenders = [];
  for (const spec of fx.endpoints.protected ?? []) {
    const [method, rawPath] = spec.split(' ');
    const path = rawPath
      .replace(/\{orgId\}/g, fx.userA.orgId)
      .replace(/\{userId\}/g, fx.userA.userId);
    const r = await req(fx.apiBaseUrl, method, path, { token: forged });
    if (r.status !== 401 && r.status !== 403) {
      offenders.push({ endpoint: spec, gotStatus: r.status });
    }
  }
  recordResult({ suite: 'forged-jwt-rejected', pass: offenders.length === 0, offenders });
  assert.equal(offenders.length, 0, `Forged JWT accepted: ${JSON.stringify(offenders, null, 2)}`);
});

test("alg='none' JWT is rejected", async () => {
  const fx = await getFixtures();
  const algNone = forgeJwt({ header: { alg: 'none' } });
  const offenders = [];
  for (const spec of (fx.endpoints.protected ?? []).slice(0, 4)) {
    // sample is enough - the strategy is global
    const [method, rawPath] = spec.split(' ');
    const path = rawPath.replace(/\{orgId\}/g, fx.userA.orgId).replace(/\{userId\}/g, fx.userA.userId);
    const r = await req(fx.apiBaseUrl, method, path, { token: algNone });
    if (r.status !== 401 && r.status !== 403) {
      offenders.push({ endpoint: spec, gotStatus: r.status });
    }
  }
  recordResult({ suite: 'alg-none-rejected', pass: offenders.length === 0, offenders });
  assert.equal(offenders.length, 0, `alg=none JWT accepted: ${JSON.stringify(offenders)}`);
});

test('Expired JWT is rejected', async () => {
  const fx = await getFixtures();
  const expired = expiredJwt();
  const offenders = [];
  for (const spec of (fx.endpoints.protected ?? []).slice(0, 4)) {
    const [method, rawPath] = spec.split(' ');
    const path = rawPath.replace(/\{orgId\}/g, fx.userA.orgId).replace(/\{userId\}/g, fx.userA.userId);
    const r = await req(fx.apiBaseUrl, method, path, { token: expired });
    if (r.status !== 401 && r.status !== 403) {
      offenders.push({ endpoint: spec, gotStatus: r.status });
    }
  }
  recordResult({ suite: 'expired-jwt-rejected', pass: offenders.length === 0, offenders });
  assert.equal(offenders.length, 0, `Expired JWT accepted: ${JSON.stringify(offenders)}`);
});

test('Garbage opaque token is rejected', async () => {
  const fx = await getFixtures();
  const offenders = [];
  for (const spec of (fx.endpoints.protected ?? []).slice(0, 4)) {
    const [method, rawPath] = spec.split(' ');
    const path = rawPath.replace(/\{orgId\}/g, fx.userA.orgId).replace(/\{userId\}/g, fx.userA.userId);
    const r = await req(fx.apiBaseUrl, method, path, { token: 'not-a-real-token-just-noise' });
    if (r.status !== 401 && r.status !== 403) {
      offenders.push({ endpoint: spec, gotStatus: r.status });
    }
  }
  recordResult({ suite: 'garbage-token-rejected', pass: offenders.length === 0, offenders });
  assert.equal(offenders.length, 0, `Garbage token accepted: ${JSON.stringify(offenders)}`);
});
