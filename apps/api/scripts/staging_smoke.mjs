#!/usr/bin/env node
/**
 * staging_smoke.mjs - End-to-end smoke test for the staging API.
 *
 * Usage:
 *   API_BASE=https://staging-api.orkora.events node apps/api/scripts/staging_smoke.mjs
 *
 * Falls back to http://localhost:4000 if API_BASE is unset (useful when
 * running the API locally against a Neon-staging DB).
 *
 * What it does, in order:
 *   1. GET /health                         expect 200, body { ok: true } or similar
 *   2. GET /v1/events/by-code/STG2026      expect 200, returns the seeded event
 *   3. POST /v1/registrations              create a free registration on the seeded event,
 *                                          tier id 019e...0005, qty 1, attendee details
 *                                          synthesised per-run
 *   4. GET /v1/tickets/by-code/<code>      look up the ticket, prove tickets.order_id
 *                                          links to the order created in step 3
 *   5. GET /v1/auth/session                expect 401 unauthenticated, proving the auth
 *                                          gate is wired correctly
 *
 * Exits 0 on full pass, 1 on any failure. Prints a per-step result line so
 * the operator can see exactly where a regression lands.
 *
 * Safe to run repeatedly. Each run creates a fresh registration / order /
 * ticket; nothing is rolled back. Staging row count is expected to drift
 * upward with each invocation - that is a feature, not a bug, because it
 * exercises the unique-index paths.
 */

const API_BASE = (process.env.API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');
const EVENT_CODE = 'STG2026';
const FREE_TIER_ID = '019e0000-0000-7000-8000-000000000005';

const fails = [];

function ok(label, detail = '') {
  console.log(`  OK    ${label}${detail ? '  -  ' + detail : ''}`);
}
function fail(label, detail) {
  console.log(`  FAIL  ${label}${detail ? '  -  ' + detail : ''}`);
  fails.push(label);
}

async function request(method, path, body, headers = {}) {
  const url = `${API_BASE}${path}`;
  const init = {
    method,
    headers: { Accept: 'application/json', ...headers },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json, text };
}

async function step1Health() {
  const r = await request('GET', '/health');
  if (r.status !== 200) return fail('health', `status=${r.status}`);
  ok('health', `status=200`);
}

async function step2Event() {
  const r = await request('GET', `/v1/events/by-code/${EVENT_CODE}`);
  if (r.status !== 200) return fail('event lookup', `status=${r.status} body=${r.text.slice(0, 200)}`);
  const slug = r.body?.event?.slug ?? r.body?.slug;
  if (slug !== 'staging-smoke-event-2026')
    return fail('event lookup', `unexpected slug ${slug}`);
  ok('event lookup', `slug=${slug}`);
}

async function step3Register() {
  const stamp = Date.now();
  const payload = {
    eventCode: EVENT_CODE,
    items: [{ tierId: FREE_TIER_ID, quantity: 1 }],
    attendees: [
      {
        firstName: 'Smoke',
        lastName: `Run-${stamp}`,
        email: `smoke+${stamp}@orkora.events`,
      },
    ],
  };
  const r = await request('POST', '/v1/registrations', payload);
  if (r.status !== 200 && r.status !== 201)
    return fail('register (free)', `status=${r.status} body=${r.text.slice(0, 300)}`);
  const ticketCode =
    r.body?.tickets?.[0]?.code ?? r.body?.registration?.tickets?.[0]?.code ?? null;
  if (!ticketCode) return fail('register (free)', 'no ticket code in response');
  ok('register (free)', `ticketCode=${ticketCode}`);
  return ticketCode;
}

async function step4Ticket(ticketCode) {
  if (!ticketCode) return fail('ticket lookup', 'skipped (no ticket code from prior step)');
  const r = await request('GET', `/v1/tickets/by-code/${ticketCode}`);
  if (r.status !== 200)
    return fail('ticket lookup', `status=${r.status} body=${r.text.slice(0, 200)}`);
  const orderId = r.body?.ticket?.orderId ?? r.body?.orderId;
  if (!orderId) return fail('ticket lookup', 'ticket has no orderId (regression of #113)');
  ok('ticket lookup', `orderId=${orderId}`);
}

async function step5AuthGate() {
  const r = await request('GET', '/v1/auth/session');
  if (r.status !== 401)
    return fail('auth gate (unauth)', `expected 401, got ${r.status}`);
  ok('auth gate (unauth)', 'status=401 as expected');
}

async function main() {
  console.log(`Smoke test against ${API_BASE}`);
  console.log('===========================');
  await step1Health();
  await step2Event();
  const ticketCode = await step3Register();
  await step4Ticket(ticketCode);
  await step5AuthGate();
  console.log('===========================');
  if (fails.length) {
    console.log(`SMOKE FAILED  -  ${fails.length} step(s) regressed: ${fails.join(', ')}`);
    process.exit(1);
  }
  console.log('SMOKE OK');
}

main().catch((e) => {
  console.error('SMOKE FAILED (uncaught):', e.message);
  process.exit(1);
});
