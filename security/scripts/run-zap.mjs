#!/usr/bin/env node
/**
 * OWASP ZAP baseline (or full) scan via Docker.
 *
 * Uses the official ZAP Docker image `ghcr.io/zaproxy/zaproxy:stable`.
 * Defaults to baseline (passive) mode: never sends mutating requests,
 * safe to run against staging without test-data damage.
 *
 * Production safety: if the target hostname matches any in
 * cfg.zap.productionHostnames AND mode != 'baseline', the script
 * REFUSES to run unless ALLOW_PROD_ZAP=1 is set in env. There's no good
 * reason to active-scan production; the rare time you do, you must
 * unlock it explicitly.
 *
 * Reports: security/reports/zap/{report-<ts>.html,latest.html,latest.json,latest.md}
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadConfig, writeReport, banner, REPORTS_DIR } from './common.mjs';

const ZAP_IMAGE = 'ghcr.io/zaproxy/zaproxy:stable';

function isProd(target, prodHosts) {
  try {
    const host = new URL(target).hostname;
    return prodHosts.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

async function which(bin) {
  return new Promise((res) => {
    const proc = spawn(process.platform === 'win32' ? 'where' : 'which', [bin]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', (code) => res(code === 0 ? out.trim().split('\n')[0] : null));
  });
}

async function main() {
  banner('OWASP ZAP scan');
  const cfg = await loadConfig();
  const target = process.env.SECURITY_TARGET_URL || cfg.appBaseUrl;
  const mode = (process.env.ZAP_MODE || cfg.zap?.mode || 'baseline').toLowerCase();
  const prodHosts = cfg.zap?.productionHostnames ?? [];
  const allowProd = process.env.ALLOW_PROD_ZAP === '1';

  if (!target) {
    console.error('No SECURITY_TARGET_URL or appBaseUrl configured. Aborting.');
    process.exit(2);
  }
  if (isProd(target, prodHosts) && mode !== 'baseline' && !allowProd) {
    console.error(
      `Refusing to run ${mode} ZAP scan against production host (${target}). ` +
        `Set ALLOW_PROD_ZAP=1 to override (don't).`,
    );
    process.exit(2);
  }
  const docker = await which('docker');
  if (!docker) {
    console.error('docker not on PATH. Install Docker or run ZAP outside this script.');
    process.exit(2);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(REPORTS_DIR, 'zap');
  await mkdir(outDir, { recursive: true });
  const htmlOut = `zap-${mode}-${ts}.html`;
  const xmlOut = `zap-${mode}-${ts}.xml`;
  const jsonOut = `zap-${mode}-${ts}.json`;

  const script =
    mode === 'baseline'
      ? 'zap-baseline.py'
      : mode === 'full'
      ? 'zap-full-scan.py'
      : 'zap-baseline.py';
  // -j enables AJAX spider for the baseline (still passive)
  // -I makes the run NOT fail on warnings (we gate ourselves in the post-processor)
  const args = [
    'run',
    '--rm',
    '-v',
    `${outDir}:/zap/wrk/:rw`,
    ZAP_IMAGE,
    script,
    '-t',
    target,
    '-r',
    htmlOut,
    '-x',
    xmlOut,
    '-J',
    jsonOut,
    '-I',
  ];

  console.log(`Running: docker ${args.join(' ')}`);
  const proc = spawn('docker', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  const code = await new Promise((r) => proc.on('close', r));

  // Whether ZAP exited 0 or non-zero, parse the JSON output if it exists.
  let findings = [];
  let summary = {};
  const jsonPath = join(outDir, jsonOut);
  if (existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(await readFile(jsonPath, 'utf8'));
      const sites = raw.site ?? raw.sites ?? [];
      for (const site of sites) {
        for (const alert of site.alerts ?? []) {
          const sev = (alert.riskdesc ?? '').toUpperCase().split(' ')[0] || 'INFO';
          findings.push({
            severity: sev === 'HIGH' || sev === 'MEDIUM' || sev === 'LOW' ? sev : 'INFO',
            title: alert.name ?? alert.alert ?? 'ZAP alert',
            detail: (alert.desc ?? alert.description ?? '').slice(0, 240),
            instances: alert.instances?.length ?? alert.count ?? 1,
          });
        }
      }
      summary = { sites: sites.length, alerts: findings.length };
    } catch (err) {
      summary = { parseError: String(err?.message ?? err) };
    }
  } else {
    summary = { note: `ZAP exited ${code}; no JSON report produced` };
  }

  // Also copy htmls to latest.html for easy CI artifact upload
  if (existsSync(join(outDir, htmlOut))) {
    await copyFile(join(outDir, htmlOut), join(outDir, 'latest.html'));
  }

  const thresholds = cfg.thresholds ?? {};
  const high = findings.filter((f) => f.severity === 'HIGH').length;
  const medium = findings.filter((f) => f.severity === 'MEDIUM').length;
  const passes =
    high <= (thresholds.zapHigh ?? 0) && medium <= (thresholds.zapMedium ?? 5);

  const payload = {
    title: 'OWASP ZAP scan',
    target,
    mode,
    generatedAt: new Date().toISOString(),
    status: passes ? 'pass' : 'fail',
    findings,
    summary: { ...summary, high, medium, dockerExit: code, threshold: { zapHigh: thresholds.zapHigh, zapMedium: thresholds.zapMedium } },
  };

  const { mdPath, jsonPath: reportJsonPath } = await writeReport('zap', payload);
  console.log(`\nReport JSON: ${reportJsonPath}`);
  console.log(`Report MD:   ${mdPath}`);
  console.log(`HTML:        ${join(outDir, 'latest.html')}`);
  console.log(`\nResult: ${payload.status.toUpperCase()} (${high} high / ${medium} medium)`);
  process.exit(passes ? 0 : 1);
}

main().catch((err) => {
  console.error('ZAP scan crashed:', err);
  process.exit(2);
});
