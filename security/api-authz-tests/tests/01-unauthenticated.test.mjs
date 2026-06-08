/**
 * Unauthenticated access tests.
 *
 * Every endpoint in cfg.endpoints.protected and cfg.endpoints.admin
 * must reject anonymous requests with 401 Unauthorized. Public
 * endpoints must NOT 401 (we expect 200/400/404/422 etc).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, req, recordResult } from '../fixtures/test-accounts.mjs';

test('Protected endpoints reject anonymous requests', async () => {
  const fx = await getFixtures();
  const offenders = [];
  for (const spec of [...(fx.endpoints.protected ?? []), ...(fx.endpoints.admin ?? [])]) {
    const [method, rawPath] = spec.split(' ');
    const path = rawPath
      .replace(/\{orgId\}/g, fx.userA.orgId ?? '00000000-0000-0000-0000-000000000000')
      .replace(/\{userId\}/g, fx.userA.userId ?? '00000000-0000-0000-0000-000000000000');
    const r = await req(fx.apiBaseUrl, method, path);
    if (r.status !== 401 && r.status !== 403) {
      offenders.push({ endpoint: spec, gotStatus: r.status, body: r.body });
    }
  }
  recordResult({
    suite: 'unauthenticated-access',
    pass: offenders.length === 0,
    offenders,
  });
  assert.equal(offenders.length, 0, `Unauthenticated requests reached protected endpoints: ${JSON.stringify(offenders, null, 2)}`);
});

test('Public endpoints accept anonymous requests', async () => {
  const fx = await getFixtures();
  const broken = [];
  for (const spec of fx.endpoints.public ?? []) {
    const [method, path] = spec.split(' ');
    // POSTs without bodies typically 400 - that is fine; we only flag 401/403
    // which would indicate auth is wrongly applied to a public endpoint.
    const r = await req(fx.apiBaseUrl, method, path, { body: method === 'POST' ? {} : undefined });
    if (r.status === 401 || r.status === 403) {
      broken.push({ endpoint: spec, gotStatus: r.status });
    }
  }
  recordResult({
    suite: 'public-endpoints-accessible',
    pass: broken.length === 0,
    offenders: broken,
  });
  assert.equal(broken.length, 0, `Public endpoints are gated by auth: ${JSON.stringify(broken, null, 2)}`);
});
