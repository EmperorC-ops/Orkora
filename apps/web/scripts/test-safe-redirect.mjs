// Regression test for safeInternalPath (apps/web/lib/auth.ts), the only guard
// on post-login redirects (?next= on /login and /otp).
//
// apps/web has no test runner, so this extracts the real function from
// lib/auth.ts, transpiles it with the workspace TypeScript, and runs it under
// plain Node. It tests the file as it is on disk, not a copy.
//
// Run: pnpm --filter @orkora/web test:redirect   (or: node scripts/test-safe-redirect.mjs)
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(here, '..', 'lib', 'auth.ts'), 'utf8');
const start = src.indexOf('export function safeInternalPath(');
if (start < 0) throw new Error('safeInternalPath not found in lib/auth.ts');
const end = src.indexOf('\n}\n', start) + 2;
const tsSource = src.slice(start, end).replace('export function', 'function');
// Prefer Node's built-in type stripper (Node 22.13+); fall back to the
// workspace TypeScript on older Node (the repo pins Node 20).
let js;
if (typeof nodeModule.stripTypeScriptTypes === 'function') {
  js = nodeModule.stripTypeScriptTypes(tsSource);
} else {
  const ts = nodeModule.createRequire(import.meta.url)('typescript');
  js = ts.transpileModule(tsSource, { compilerOptions: { target: 99 /* ESNext */ } }).outputText;
}
const safeInternalPath = new Function(`${js}; return safeInternalPath;`)();

const ORIGIN = 'https://orkora.events';
// An output the browser cannot even parse counts as a failure too: the guard
// must only ever hand router.push a valid same-origin path.
const offsite = (p) => {
  try { return new URL(p, `${ORIGIN}/login`).origin !== ORIGIN; } catch { return true; }
};
let failures = 0;
const must = (ok, msg) => { if (!ok) { failures++; console.error('FAIL', msg); } };

// Legitimate internal paths survive.
for (const [inp, exp] of [
  ['/dashboard', '/dashboard'],
  ['/events/abc?tab=tickets#top', '/events/abc?tab=tickets#top'],
  ['/invite/accept?token=abc%2Bdef', '/invite/accept?token=abc%2Bdef'],
  ['/admin', '/admin'],
]) must(safeInternalPath(inp) === exp, `legit ${inp} -> ${safeInternalPath(inp)}`);

// Known attacks. `/\t/evil.com` is the bypass the previous version allowed.
for (const a of [
  '//evil.com', '///evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com',
  'http:evil.com', 'javascript:alert(1)', 'data:text/html,x', 'evil.com',
  '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\t\t/evil.com', ' //evil.com',
  '/\r/9%', '', null, undefined, '/' + 'a'.repeat(3000),
]) must(!offsite(safeInternalPath(a)), `attack ${JSON.stringify(a)} -> ${safeInternalPath(a)}`);
must(safeInternalPath('/\t/evil.com') === '/dashboard', 'tab bypass must fall back');

// Full chain as an attacker would send it: link -> URLSearchParams -> guard.
for (const q of ['?next=/%09/evil.com', '?next=/%0a/evil.com', '?next=%2F%2Fevil.com', '?next=/%5C/evil.com'])
  must(!offsite(safeInternalPath(new URLSearchParams(q).get('next'))), `chain ${q}`);

// Fuzz with an adversarial alphabet.
const A = ['/', '\\', '\t', '\n', '\r', ' ', '.', ':', '@', '%', '0', '9', 'e', 'v', '#', '?', '\u0000', '\u007f'];
for (let i = 0; i < 100000; i++) {
  let s = '/';
  for (let j = 0, n = 1 + Math.floor(Math.random() * 10); j < n; j++) s += A[Math.floor(Math.random() * A.length)];
  if (offsite(safeInternalPath(s))) { failures++; console.error('FUZZ ESCAPE', JSON.stringify(s)); break; }
}

console.log(failures ? `${failures} failure(s)` : 'safeInternalPath: all redirect tests pass (100k fuzz)');
process.exit(failures ? 1 : 0);
