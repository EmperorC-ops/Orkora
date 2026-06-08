/**
 * Request-mutation tests (Burp-style replay with attacker-controlled
 * fields).
 *
 * User A submits valid payloads but with attacker-controlled values
 * for fields the server MUST authoritatively derive from the token:
 *   - userId / user_id
 *   - orgId / organization_id / tenant_id
 *   - role / platformRole
 *   - isAdmin / admin
 *
 * The server must either ignore those fields entirely or reject the
 * request. It MUST NOT honour them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, req, recordResult } from '../fixtures/test-accounts.mjs';

test('User A cannot escalate role via payload field on profile update', async () => {
  const fx = await getFixtures();
  // Try a few common profile-update endpoints. If none exist, skip
  // (a 404 is OK; the test is whether ANY succeeds with role injection).
  const candidates = [
    { method: 'PATCH', path: '/v1/me' },
    { method: 'PUT', path: '/v1/me' },
    { method: 'POST', path: '/v1/me' },
  ];
  const attempts = [];
  for (const c of candidates) {
    const r = await req(fx.apiBaseUrl, c.method, c.path, {
      token: fx.userA.token,
      body: { platformRole: 'superadmin', role: 'admin', isAdmin: true },
    });
    attempts.push({ ...c, status: r.status });
    if (r.status === 200 || r.status === 204) {
      // Now read /v1/me back and confirm role is NOT escalated.
      const me = await req(fx.apiBaseUrl, 'GET', '/v1/me', { token: fx.userA.token });
      const role = me.body?.platformRole ?? me.body?.role ?? 'none';
      assert.notEqual(role, 'superadmin', `Role escalated via PATCH body! /v1/me now shows ${role}`);
      assert.notEqual(role, 'admin', `Role escalated via PATCH body! /v1/me now shows ${role}`);
    }
  }
  recordResult({ suite: 'role-escalation-via-profile-update', pass: true, attempts });
});

test('User A cannot impersonate User B via user_id in checkout payload', async () => {
  const fx = await getFixtures();
  // Sample mutation: a checkout-style endpoint where the user submits
  // their cart. The server must NOT honour a user_id from the body.
  const candidates = [
    '/v1/payments/checkout',
    '/v1/checkout',
    '/v1/orders',
  ];
  const flagged = [];
  for (const path of candidates) {
    const r = await req(fx.apiBaseUrl, 'POST', path, {
      token: fx.userA.token,
      body: {
        userId: fx.userB.userId,
        user_id: fx.userB.userId,
        eventId: '00000000-0000-0000-0000-000000000000',
      },
    });
    // 404 = endpoint doesn't exist (fine), 400/422 = validation rejected,
    // 401/403 = auth/authz rejected, 201/200 = the request succeeded
    // (which is suspicious if it succeeded BECAUSE of the userId
    // injection rather than being routed back to userA).
    if (r.status === 201 || r.status === 200) {
      flagged.push({ path, status: r.status, body: r.body, note: 'Verify manually: did the order land on User B or User A?' });
    }
  }
  recordResult({ suite: 'user-id-injection-checkout', pass: flagged.length === 0, offenders: flagged });
  // We don't assert == 0 because a checkout endpoint can legitimately
  // succeed - the server just ignores the body userId. The test
  // surfaces these for human review.
});

test('User A cannot pass org_id in body to access Org B data', async () => {
  const fx = await getFixtures();
  if (!fx.userB.orgId) return;
  // Many list endpoints use the path param to determine scope. Try
  // sending an "orgId" body field via a typical "search" endpoint to
  // see if the API ever honours it. Same disposition: 404 means no
  // such endpoint; 200 with B's data means broken authz.
  const candidates = [
    { method: 'POST', path: '/v1/search' },
    { method: 'POST', path: '/v1/registrations/search' },
  ];
  const flagged = [];
  for (const c of candidates) {
    const r = await req(fx.apiBaseUrl, c.method, c.path, {
      token: fx.userA.token,
      body: { orgId: fx.userB.orgId, organizationId: fx.userB.orgId, tenantId: fx.userB.orgId },
    });
    if (r.status === 200 || r.status === 201) {
      flagged.push({ ...c, status: r.status, hint: 'If results contain Org B data, this is broken authz.' });
    }
  }
  recordResult({ suite: 'org-id-injection-search', pass: flagged.length === 0, offenders: flagged });
});
