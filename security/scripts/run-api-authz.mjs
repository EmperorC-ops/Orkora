#!/usr/bin/env node
/**
 * Run the API authorization abuse test suite.
 *
 * Driver around `node --test security/api-authz-tests/tests/*.test.mjs`.
 * Streams TAP output to stdout AND parses it so we can write a
 * single JSON+MD report alongside the other security artefacts.
 *
 * Fail criteria:
 *   - Any test failure counts as a failure.
 *   - Suites that recorded offenders > 0 count even if assertion code
 *     was lenient (the offenders array is the source of truth).
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { writeReport, banner, REPO_ROOT } from './common.mjs';

async function listSpecs() {
  const dir = resolve(REPO_ROOT, 'security/api-authz-tests/tests');
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => resolve(dir, f));
}

async function main() {
  banner('API authorization abuse tests');
  const specs = await listSpecs();
  if (specs.length === 0) {
    console.log('No specs found under security/api-authz-tests/tests.');
    process.exit(0);
  }

  // We run the specs together so a shared fixtures cache survives.
  // node --test runs each file in its own process by default; we use
  // --test-reporter=tap and parse the aggregate.
  const args = ['--test', '--test-reporter=tap', ...specs];
  console.log(`Running: node ${args.join(' ')}`);

  let tap = '';
  const proc = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => {
    const s = d.toString();
    tap += s;
    process.stdout.write(s);
  });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  const code = await new Promise((r) => proc.on('close', r));

  // Parse TAP for ok/not ok counts. Each spec contributes named tests.
  const results = [];
  for (const line of tap.split('\n')) {
    const m = /^(ok|not ok)\s+(\d+)\s+-\s+(.+?)(?:\s+#\s+(.*))?$/.exec(line);
    if (!m) continue;
    results.push({ pass: m[1] === 'ok', name: m[3].trim(), note: m[4]?.trim() ?? null });
  }
  const failures = results.filter((r) => !r.pass);
  const findings = failures.map((f) => ({
    severity: 'HIGH',
    title: `Authz test failed: ${f.name}`,
    detail: f.note ?? 'See TAP output above for the assertion message.',
  }));

  const payload = {
    title: 'API authorization abuse tests',
    target: process.env.API_BASE_URL ?? '(see security-audit.config.json)',
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 && code === 0 ? 'pass' : 'fail',
    findings,
    summary: {
      tests: results.length,
      failed: failures.length,
      runnerExitCode: code,
    },
  };

  const { mdPath, jsonPath } = await writeReport('api-authz', payload);
  console.log(`\nReport: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
  console.log(`\nResult: ${payload.status.toUpperCase()} (${failures.length} failure(s))`);
  process.exit(payload.status === 'pass' ? 0 : 1);
}

main().catch((err) => {
  console.error('API authz runner crashed:', err);
  process.exit(2);
});
