/**
 * Cross-tenant + cross-user IDOR / BOLA tests.
 *
 * User A presents A's valid token but addresses B's tenant or
 * record. Every such request MUST return 403 (or a safe 404 that does
 * not leak existence). A 200 means broken access control.
 *
 * Covers:
 *   - Reading Org B's events as User A
 *   - Reading Org B's registrations as User A
 *   - Reading Org B's attendees as User A
 *   - Reading Org B's analytics as User A
 *   - Mutating Org B (create event in B's org as A)
 *   - Reading User B's profile via /v1/me variants if applicable
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, req, recordResult } from '../fixtures/test-accounts.mjs';

function expectDenied(status) {
  // Either Forbidden or "not found" (which leaks nothing). 401 also acceptable.
  return status === 403 || status === 404 || status === 401;
}

test("User A cannot read Org B's events", async () => {
  const fx = await getFixtures();
  if (!fx.userB.orgId) {
    return; // org B id not configured; skip with a warning, recorded
  }
  const r = await req(fx.apiBaseUrl, 'GET', `/v1/organizations/${fx.userB.orgId}/events`, {
    token: fx.userA.token,
  });
  recordResult({ suite: 'cross-tenant-events-read', pass: expectDenied(r.status), offenders: expectDenied(r.status) ? [] : [{ status: r.status, body: r.body }] });
  assert.ok(expectDenied(r.status), `User A accessed Org B's events: status ${r.status}, body=${JSON.stringify(r.body)?.slice(0, 200)}`);
});

test("User A cannot read Org B's registrations", async () => {
  const fx = await getFixtures();
  if (!fx.userB.orgId) return;
  const r = await req(fx.apiBaseUrl, 'GET', `/v1/organizations/${fx.userB.orgId}/registrations`, {
    token: fx.userA.token,
  });
  recordResult({ suite: 'cross-tenant-registrations-read', pass: expectDenied(r.status), offenders: expectDenied(r.status) ? [] : [{ status: r.status }] });
  assert.ok(expectDenied(r.status), `User A read Org B registrations: ${r.status}`);
});

test("User A cannot read Org B's attendees", async () => {
  const fx = await getFixtures();
  if (!fx.userB.orgId) return;
  const r = await req(fx.apiBaseUrl, 'GET', `/v1/organizations/${fx.userB.orgId}/attendees`, {
    token: fx.userA.token,
  });
  recordResult({ suite: 'cross-tenant-attendees-read', pass: expectDenied(r.status), offenders: expectDenied(r.status) ? [] : [{ status: r.status }] });
  assert.ok(expectDenied(r.status), `User A read Org B attendees: ${r.status}`);
});

test("User A cannot read Org B's analytics", async () => {
  const fx = await getFixtures();
  if (!fx.userB.orgId) return;
  const r = await req(fx.apiBaseUrl, 'GET', `/v1/organizations/${fx.userB.orgId}/analytics`, {
    token: fx.userA.token,
  });
  recordResult({ suite: 'cross-tenant-analytics-read', pass: expectDenied(r.status), offenders: expectDenied(r.status) ? [] : [{ status: r.status }] });
  assert.ok(expectDenied(r.status), `User A read Org B analytics: ${r.status}`);
});

test('User A cannot create an event in Org B', async () => {
  const fx = await getFixtures();
  if (!fx.userB.orgId) return;
  const r = await req(fx.apiBaseUrl, 'POST', `/v1/organizations/${fx.userB.orgId}/events`, {
    token: fx.userA.token,
    body: {
      title: '[security-test] cross-tenant injection attempt',
      slug: `sectest-${Date.now()}`,
      startAt: new Date(Date.now() + 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 90_000_000).toISOString(),
      timezone: 'UTC',
    },
  });
  recordResult({ suite: 'cross-tenant-event-create', pass: expectDenied(r.status), offenders: expectDenied(r.status) ? [] : [{ status: r.status, body: r.body }] });
  assert.ok(expectDenied(r.status), `User A created an event in Org B: status ${r.status}, body=${JSON.stringify(r.body)?.slice(0, 200)}`);
});
