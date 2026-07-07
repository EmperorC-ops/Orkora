#!/usr/bin/env node
/**
 * Synthetic login-page health check.
 *
 * Exists because of the 2026-07-07 incident: an enforced CSP
 * (nonce + strict-dynamic) shipped without the nonce ever reaching Next's
 * renderer, so every script tag was blocked and the platform ran with zero
 * client-side JS for weeks. Nothing alerted, because the page still
 * server-rendered "fine" and uptime checks only assert HTTP 200.
 *
 * This script asserts the things that actually broke:
 *
 *   1. /login returns 200.
 *   2. The CSP header carries a nonce, and every executable <script> tag in
 *      the HTML carries that same nonce (a nonce-less executable script under
 *      strict-dynamic means hydration is dead).
 *   3. The first few /_next/static chunk URLs referenced by the page return
 *      200 with a JavaScript content type (catches the service-worker /
 *      CDN / deploy-skew class of failure at the origin).
 *   4. The login <form> still declares method="post" (the guard that keeps a
 *      pre-hydration native submit from putting credentials in the URL).
 *   5. Optionally, a full credentialed login against the API when
 *      SYNTHETIC_LOGIN_EMAIL / SYNTHETIC_LOGIN_PASSWORD are set (use a
 *      dedicated no-privilege test account; never a real user).
 *
 * Usage:
 *   node scripts/synthetic-login-check.mjs
 *   CHECK_BASE_URL=https://staging.orkora.events node scripts/synthetic-login-check.mjs
 *
 * Exit code 0 = healthy, 1 = one or more checks failed (fails CI, which is
 * the alert channel).
 */

const BASE = (process.env.CHECK_BASE_URL ?? 'https://www.orkora.events').replace(/\/$/, '');
const API = (process.env.CHECK_API_URL ?? 'https://api.orkora.events').replace(/\/$/, '');

const failures = [];
const notes = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL  ${msg}`);
}
function ok(msg) {
  console.log(`ok    ${msg}`);
}

// -------------------- 1. login page --------------------

let html = '';
let csp = '';
try {
  const res = await fetch(`${BASE}/login`, {
    redirect: 'follow',
    headers: { 'user-agent': 'orkora-synthetic-check/1.0' },
  });
  if (res.status !== 200) {
    fail(`GET /login returned ${res.status} (expected 200)`);
  } else {
    ok(`GET /login -> 200`);
  }
  csp = res.headers.get('content-security-policy') ?? '';
  html = await res.text();
} catch (err) {
  fail(`GET /login threw: ${err.message}`);
}

// -------------------- 2. CSP nonce on every executable script --------------------

if (html) {
  const nonceMatch = csp.match(/'nonce-([^']+)'/);
  const strictDynamic = csp.includes("'strict-dynamic'");
  if (!csp) {
    fail('No Content-Security-Policy response header on /login');
  } else if (strictDynamic && !nonceMatch) {
    fail("CSP uses 'strict-dynamic' but carries no nonce - all scripts blocked");
  } else if (nonceMatch) {
    const nonce = nonceMatch[1];
    // Executable scripts: every <script ...> without a data-ish type.
    const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
    const executable = scriptTags.filter(
      (t) => !/type="(application\/(ld\+)?json|text\/template)"/i.test(t),
    );
    const nonceless = executable.filter((t) => !t.includes(`nonce="${nonce}"`));
    if (executable.length === 0) {
      fail('No <script> tags found on /login at all - page is not a Next.js render');
    } else if (nonceless.length > 0) {
      fail(
        `${nonceless.length}/${executable.length} executable script tags are missing the CSP nonce - hydration is blocked. First offender: ${nonceless[0].slice(0, 120)}`,
      );
    } else {
      ok(`CSP nonce present and matches all ${executable.length} executable script tags`);
    }
  } else {
    notes.push('CSP present without nonce/strict-dynamic; nonce check skipped');
  }

  // -------------------- 3. chunk availability --------------------

  const chunkSrcs = [...html.matchAll(/src="([^"]*\/_next\/static\/[^"]+\.js)"/g)]
    .map((m) => m[1])
    .slice(0, 3);
  if (chunkSrcs.length === 0) {
    fail('No /_next/static script srcs found on /login');
  }
  for (const src of chunkSrcs) {
    const url = src.startsWith('http') ? src : `${BASE}${src}`;
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'orkora-synthetic-check/1.0' } });
      const ct = res.headers.get('content-type') ?? '';
      if (res.status !== 200) {
        fail(`chunk ${url} -> ${res.status} (expected 200)`);
      } else if (!/javascript|ecmascript/i.test(ct)) {
        fail(`chunk ${url} served with content-type "${ct}" (nosniff will block execution)`);
      } else {
        ok(`chunk ${src.split('/').pop()} -> 200 ${ct}`);
      }
    } catch (err) {
      fail(`chunk ${url} threw: ${err.message}`);
    }
  }

  // -------------------- 4. form method --------------------

  const formTag = html.match(/<form\b[^>]*>/i)?.[0] ?? '';
  if (!formTag) {
    fail('No <form> tag found on /login');
  } else if (!/method="post"/i.test(formTag)) {
    fail(
      `Login form is missing method="post" (${formTag.slice(0, 100)}) - a pre-hydration submit will GET credentials into the URL`,
    );
  } else {
    ok('login form declares method="post"');
  }
}

// -------------------- 5. optional credentialed login --------------------

const email = process.env.SYNTHETIC_LOGIN_EMAIL;
const password = process.env.SYNTHETIC_LOGIN_PASSWORD;
if (email && password) {
  try {
    const res = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'orkora-synthetic-check/1.0' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 200 && res.status !== 201) {
      fail(`API login for synthetic account returned ${res.status}`);
    } else {
      const body = await res.json().catch(() => ({}));
      if (!body.accessToken) {
        fail('API login returned 2xx but no accessToken in the body');
      } else {
        ok('credentialed synthetic login succeeded');
      }
    }
  } catch (err) {
    fail(`API login threw: ${err.message}`);
  }
} else {
  notes.push('SYNTHETIC_LOGIN_EMAIL/PASSWORD not set; credentialed login skipped');
}

// -------------------- verdict --------------------

for (const n of notes) console.log(`note  ${n}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) FAILED for ${BASE}`);
  process.exit(1);
}
console.log(`\nAll checks passed for ${BASE}`);
