#!/usr/bin/env node
/**
 * Run the full security audit harness.
 *
 * Order:
 *   1. Dependency vulnerability audit (pnpm + Snyk).
 *   2. Secrets scan (TruffleHog + GitGuardian).
 *   3. Browser-bundle leak scan.
 *   4. Transport posture (HTTPS, HSTS, cookies).
 *   5. API authorization abuse tests.
 *   6. OWASP ZAP baseline (only if SECURITY_TARGET_URL is configured
 *      AND Docker is available).
 *
 * Each step writes its own report under security/reports/<area>/.
 * The orchestrator concatenates the final statuses and exits non-zero
 * if any required step failed. Optional steps (ZAP, transport with no
 * URL) are reported as SKIPPED, not failed.
 *
 * Env knobs:
 *   - SKIP=deps,secrets,bundle,transport,api,zap   skip specific areas
 *   - REQUIRE=deps,secrets,...                     mark a normally
 *                                                  optional step as
 *                                                  required (fails CI)
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReport, banner } from './common.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const STEPS = [
  { id: 'deps',      label: 'Dependency audit',         script: 'check-deps.mjs',         optional: false },
  { id: 'secrets',   label: 'Secrets scan',             script: 'check-secrets.mjs',      optional: false },
  { id: 'bundle',    label: 'Web bundle leak scan',     script: 'check-bundle-leaks.mjs', optional: false },
  { id: 'transport', label: 'Transport posture',        script: 'check-transport.mjs',    optional: true  },
  { id: 'api',       label: 'API authorization tests',  script: 'run-api-authz.mjs',      optional: true  },
  { id: 'zap',       label: 'OWASP ZAP scan',           script: 'run-zap.mjs',            optional: true  },
];

function parseList(env) {
  return (env ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function runChild(script) {
  const path = resolve(HERE, script);
  return new Promise((resolveP) => {
    const proc = spawn(process.execPath, [path], { stdio: 'inherit', env: { ...process.env } });
    proc.on('close', (code) => resolveP(code));
  });
}

async function main() {
  banner('Orkora security audit (orchestrator)');
  const skip = new Set(parseList(process.env.SKIP));
  const require_ = new Set(parseList(process.env.REQUIRE));

  const results = [];
  for (const step of STEPS) {
    if (skip.has(step.id)) {
      console.log(`\n[skip] ${step.label}`);
      results.push({ ...step, status: 'skipped', code: null });
      continue;
    }
    banner(`> ${step.label}`);
    const code = await runChild(step.script);
    const passed = code === 0;
    results.push({ ...step, status: passed ? 'pass' : 'fail', code });
    console.log(`\n[${passed ? 'pass' : 'fail'}] ${step.label} (exit ${code})`);
  }

  // Aggregate verdict
  const requiredFailed = results.filter((r) => {
    if (r.status !== 'fail') return false;
    const required = !r.optional || require_.has(r.id);
    return required;
  });
  const status = requiredFailed.length === 0 ? 'pass' : 'fail';

  const payload = {
    title: 'Security audit aggregate',
    generatedAt: new Date().toISOString(),
    status,
    findings: requiredFailed.map((r) => ({
      severity: 'HIGH',
      title: `Required step failed: ${r.label}`,
      detail: `exit code ${r.code}. See security/reports/${r.id}/latest.md`,
    })),
    summary: {
      steps: results.map(({ id, label, status, code, optional }) => ({ id, label, status, code, optional })),
    },
  };
  await writeReport('aggregate', payload);

  console.log('\n=== aggregate ===');
  for (const r of results) {
    console.log(`  ${r.status.padEnd(7)}  ${r.label}${r.optional ? ' (optional)' : ''}`);
  }
  console.log(`\nOverall: ${status.toUpperCase()}`);
  process.exit(status === 'pass' ? 0 : 1);
}

main().catch((err) => {
  console.error('Orchestrator crashed:', err);
  process.exit(2);
});
