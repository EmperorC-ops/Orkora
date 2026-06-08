/**
 * Admin-endpoint protection tests.
 *
 * User A (a normal organizer) must NOT be able to reach any endpoint
 * in cfg.endpoints.admin. The platform/superadmin scope is gated by
 * the PlatformGuard - any 200/201 from these endpoints with A's token
 * is a critical broken-access-control finding.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, req, recordResult } from '../fixtures/test-accounts.mjs';

test('Non-admin user cannot reach admin endpoints', async () => {
  const fx = await getFixtures();
  const offenders = [];
  for (const spec of fx.endpoints.admin ?? []) {
    const [method, rawPath] = spec.split(' ');
    const path = rawPath
      .replace(/\{orgId\}/g, fx.userA.orgId ?? '00000000-0000-0000-0000-000000000000')
      .replace(/\{userId\}/g, fx.userA.userId ?? '00000000-0000-0000-0000-000000000000');
    const r = await req(fx.apiBaseUrl, method, path, {
      token: fx.userA.token,
      body: method === 'POST' || method === 'PATCH' || method === 'PUT' ? {} : undefined,
    });
    // Expected: 401 (token rejected) or 403 (token valid, role denied).
    // 404 only acceptable if the admin endpoint hides existence; we
    // treat 404 as acceptable for a non-admin to keep this test stable.
    if (r.status !== 401 && r.status !== 403 && r.status !== 404) {
      offenders.push({ endpoint: spec, status: r.status, body: r.body });
    }
  }
  recordResult({ suite: 'admin-endpoint-protection', pass: offenders.length === 0, offenders });
  assert.equal(offenders.length, 0, `Non-admin user reached admin endpoints: ${JSON.stringify(offenders, null, 2)}`);
});
