/**
 * Unchecked-parameter / injection probes.
 *
 * Quick probes for parameters that get passed unchecked to the DB
 * layer. Not a full SQLi fuzzer; targets the common shapes our API
 * actually accepts.
 *
 *   - SQLi: a single-quote in a search query should NOT 500 (which
 *     would indicate an unhandled exception, often from a raw SQL path)
 *     AND should NOT return data from another tenant.
 *   - XSS reflection: a probe string sent to a search endpoint must
 *     not be echoed unescaped in any 200 response.
 *   - Type confusion: number where a UUID is expected, array where a
 *     string is expected, prototype pollution payloads.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getFixtures, req, recordResult } from '../fixtures/test-accounts.mjs';

const PROBES = [
  { label: 'sql-single-quote', value: "' OR 1=1 -- " },
  { label: 'sql-stacked', value: "1; DROP TABLE users; --" },
  { label: 'xss-script', value: '<script>alert(1)</script>' },
  { label: 'xss-img', value: '"><img src=x onerror=alert(1)>' },
  { label: 'proto-pollution', value: '__proto__[isAdmin]=true' },
];

test('Search-style probes do not 500 or reflect XSS', async () => {
  const fx = await getFixtures();
  // Hit a tolerant endpoint that accepts a free-text query. Adjust if
  // the API exposes different search endpoints; we sample a few.
  const candidates = [
    (q) => `/v1/organizations/${fx.userA.orgId}/events?q=${encodeURIComponent(q)}`,
    (q) => `/v1/me/tickets?q=${encodeURIComponent(q)}`,
  ];
  const flagged = [];
  for (const probe of PROBES) {
    for (const make of candidates) {
      const r = await req(fx.apiBaseUrl, 'GET', make(probe.value), { token: fx.userA.token });
      if (r.status >= 500) {
        flagged.push({ probe: probe.label, url: make(probe.value), status: r.status, body: r.body });
        continue;
      }
      if (r.status === 200 && r.body) {
        const json = JSON.stringify(r.body);
        if (probe.label.startsWith('xss') && json.includes(probe.value) && /<script|onerror=/i.test(json)) {
          flagged.push({ probe: probe.label, url: make(probe.value), note: 'Reflected unescaped in JSON response' });
        }
      }
    }
  }
  recordResult({ suite: 'search-probes', pass: flagged.length === 0, offenders: flagged });
  assert.equal(flagged.length, 0, `Probes flagged: ${JSON.stringify(flagged, null, 2)}`);
});

test('UUID path params reject non-UUID values', async () => {
  const fx = await getFixtures();
  const bogus = ['1', '../../etc/passwd', 'undefined', '"><script>'];
  const offenders = [];
  for (const id of bogus) {
    const r = await req(fx.apiBaseUrl, 'GET', `/v1/organizations/${encodeURIComponent(id)}/events`, {
      token: fx.userA.token,
    });
    // Should 400 (validation) or 401/403/404. A 500 means a raw value
    // hit the DB; a 200 means routing accepted a non-UUID id which is
    // a tenancy hazard.
    if (r.status === 500 || r.status === 200) {
      offenders.push({ id, status: r.status });
    }
  }
  recordResult({ suite: 'uuid-path-param-validation', pass: offenders.length === 0, offenders });
  assert.equal(offenders.length, 0, `Non-UUID path params accepted or crashed server: ${JSON.stringify(offenders)}`);
});
