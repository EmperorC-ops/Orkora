#!/usr/bin/env node
// Static smoke check for the mobile app. Runs in plain Node — no Expo, no
// React Native, no Metro. Verifies that:
//   1. Every required dependency is declared in package.json.
//   2. Each screen's API calls hit a known v1 endpoint shape.
//   3. The event registration / ticket lookup / live event paths resolve to
//      controllers we ship in apps/api.
//
// We can't boot Expo Go from CI, so this catches the most common drift
// (wrong path, missing dep, typo in client.ts). Run with:
//   node apps/mobile/scripts/smoke.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

let failed = 0;
function check(label, ok, hint) {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}${ok || !hint ? '' : ` — ${hint}`}`);
  if (!ok) failed++;
}

// 1. Required deps.
const deps = pkg.dependencies ?? {};
const required = [
  'react-native-qrcode-svg',
  'react-native-svg',
  'react-native-safe-area-context',
  'expo-router',
  'expo-secure-store',
  'expo-constants',
];
for (const r of required) {
  check(`dependency declared: ${r}`, Boolean(deps[r]), `missing from package.json`);
}

// 2. Screens reference paths that the API ships.
const screens = [
  'app/(event)/register.tsx',
  'app/(event)/ticket.tsx',
  'app/(event)/home.tsx',
  'app/(auth)/login.tsx',
  'app/(auth)/signup.tsx',
  'app/(auth)/otp.tsx',
];
for (const s of screens) {
  check(`screen present: ${s}`, existsSync(join(root, s)));
}

// 3. API client paths align with the API.
const client = readFileSync(join(root, 'src/api/client.ts'), 'utf8');
const expectedPaths = [
  '/v1/events/by-code/',
  '/v1/events/by-slug/',
  '/v1/events/by-code/${encodeURIComponent(eventCode)}/register',
  '/v1/tickets/by-code/',
  '/v1/me/tickets',
  '/v1/auth/login',
  '/v1/auth/signup',
  '/v1/auth/otp/send',
  '/v1/auth/otp/verify',
];
for (const p of expectedPaths) {
  check(`client.ts uses ${p}`, client.includes(p), `not found in client.ts`);
}

// 4. Verify the API has matching controllers (best effort: text grep).
const apiRoot = join(root, '..', 'api', 'src');
const apiExists = existsSync(apiRoot);
if (apiExists) {
  const expected = [
    { route: '/events/by-code/:code/register', files: ['modules/registrations/registrations.controller.ts'] },
    { route: '/tickets/by-code/:code', files: ['modules/registrations/registrations.controller.ts'] },
    { route: '/me/tickets', files: ['modules/registrations/registrations.controller.ts'] },
    { route: '/auth/login', files: ['modules/auth/auth.controller.ts'] },
    { route: '/auth/signup', files: ['modules/auth/auth.controller.ts'] },
  ];
  for (const e of expected) {
    let found = false;
    for (const f of e.files) {
      const p = join(apiRoot, f);
      if (existsSync(p)) {
        const c = readFileSync(p, 'utf8');
        if (c.includes(e.route.split('/').filter(Boolean).pop()) || c.includes(e.route)) {
          found = true;
        }
      }
    }
    check(`api ships handler matching ${e.route}`, found, `did not find a matching handler`);
  }
} else {
  console.log(`[SKIP] api source not found at ${apiRoot}; skipping cross-app checks`);
}

if (failed) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
