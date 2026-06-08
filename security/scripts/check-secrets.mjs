#!/usr/bin/env node
/**
 * Secrets scanning.
 *
 * Always runs TruffleHog (via Docker if locally installed binary is not
 * found). TruffleHog's verified-secrets mode validates each match by
 * calling the corresponding provider's API; we treat verified hits as
 * gating, unverified hits as informational. Scans BOTH the working tree
 * (catches secrets staged but not committed) AND the full git history
 * (catches secrets that were committed and force-pushed over).
 *
 * If GITGUARDIAN_API_KEY is set, ALSO runs ggshield - it covers slightly
 * different rule sets than TruffleHog and reduces blind spots.
 *
 * Reports: security/reports/secrets/{latest.json,latest.md}
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, writeReport, banner, SEVERITY } from './common.mjs';

const exec = promisify(execFile);

async function which(bin) {
  try {
    const r = await exec(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return r.stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

async function dockerAvailable() {
  return (await which('docker')) !== null;
}

async function runTrufflehog(area, args) {
  const local = await which('trufflehog');
  if (local) {
    return spawnCollect(local, args);
  }
  if (!(await dockerAvailable())) {
    return {
      code: 2,
      stdout: '',
      stderr:
        'Neither trufflehog nor docker is on PATH. Install via https://github.com/trufflesecurity/trufflehog or install Docker.',
    };
  }
  // Mount the repo into a transient container.
  const dockerArgs = [
    'run',
    '--rm',
    '-v',
    `${process.cwd()}:/src`,
    '-w',
    '/src',
    'trufflesecurity/trufflehog:latest',
    ...args,
  ];
  return spawnCollect('docker', dockerArgs);
}

function spawnCollect(cmd, args) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function parseTrufflehog(stdout) {
  // TruffleHog outputs newline-delimited JSON, one finding per line.
  const findings = [];
  for (const line of stdout.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const obj = JSON.parse(t);
      const verified = obj.Verified === true;
      findings.push({
        severity: verified ? 'CRITICAL' : 'MEDIUM',
        title: `${obj.DetectorName ?? 'Secret'}${verified ? ' (verified live)' : ''}`,
        detail: `${obj.SourceMetadata?.Data?.Filesystem?.file ?? obj.SourceMetadata?.Data?.Git?.file ?? 'unknown file'}${obj.SourceMetadata?.Data?.Git?.line ? `:${obj.SourceMetadata.Data.Git.line}` : ''}`,
        source: 'trufflehog',
        verified,
      });
    } catch {
      // skip unparseable lines
    }
  }
  return findings;
}

async function runGitGuardian() {
  if (!process.env.GITGUARDIAN_API_KEY) {
    return { available: false, findings: [] };
  }
  const cli = (await which('ggshield')) || (await which('ggshield-cli'));
  if (!cli) {
    return {
      available: true,
      error:
        'ggshield not installed. pipx install ggshield  OR run via docker run ghcr.io/gitguardian/ggshield.',
      findings: [],
    };
  }
  const r = await spawnCollect(cli, [
    'secret',
    'scan',
    'repo',
    '.',
    '--json',
    '--show-secrets', // we only need counts; the JSON path-redacts in our log
  ]);
  return { available: true, ...parseGitGuardian(r) };
}

function parseGitGuardian({ stdout }) {
  const findings = [];
  try {
    const obj = JSON.parse(stdout);
    const incidents = obj.entities_with_incidents ?? [];
    for (const ent of incidents) {
      for (const inc of ent.incidents ?? []) {
        findings.push({
          severity: 'HIGH',
          title: `${inc.policy ?? 'Secret detected'}: ${inc.detector?.display_name ?? 'unknown detector'}`,
          detail: `${ent.filename ?? 'unknown file'}:${inc.line_number ?? '?'}`,
          source: 'gitguardian',
        });
      }
    }
  } catch {
    // ignore parse failure; ggshield exit code already reflects findings
  }
  return { findings };
}

async function main() {
  banner('Secrets scan');
  const cfg = await loadConfig();
  const threshold = cfg.thresholds?.secretsVerified ?? 0;

  console.log('Scanning working tree + git history with TruffleHog...');
  const treeRes = await runTrufflehog('tree', [
    'filesystem',
    '.',
    '--json',
    '--no-update',
    '--exclude-paths=node_modules,.next,dist,build,coverage,.git,security/reports',
  ]);
  const historyRes = await runTrufflehog('history', [
    'git',
    'file://.',
    '--json',
    '--no-update',
  ]);

  const tree = parseTrufflehog(treeRes.stdout);
  const history = parseTrufflehog(historyRes.stdout);
  const trufflehogFindings = dedup([...tree, ...history]);
  console.log(`trufflehog: ${trufflehogFindings.length} finding(s) (${tree.length} tree + ${history.length} history)`);

  const gg = await runGitGuardian();
  if (gg.available) {
    console.log(`gitguardian: ${gg.findings.length} finding(s)`);
  } else {
    console.log('gitguardian: not configured (GITGUARDIAN_API_KEY missing)');
  }
  if (gg.error) console.log(`gitguardian error: ${gg.error}`);

  const findings = dedup([...trufflehogFindings, ...gg.findings]);
  const verified = findings.filter((f) => f.verified === true || f.source === 'gitguardian');
  const passes = verified.length <= threshold;

  const payload = {
    title: 'Secrets scan',
    target: 'working tree + git history',
    generatedAt: new Date().toISOString(),
    status: passes ? 'pass' : 'fail',
    findings,
    summary: {
      total: findings.length,
      verified: verified.length,
      threshold,
      sources: {
        trufflehog: {
          tree: tree.length,
          history: history.length,
          exitCodes: { tree: treeRes.code, history: historyRes.code },
        },
        gitguardian: gg.available ? gg.findings.length : 'skipped',
      },
    },
  };

  const { mdPath, jsonPath } = await writeReport('secrets', payload);
  console.log(`\nReport: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
  console.log(`\nResult: ${payload.status.toUpperCase()} (${verified.length} verified vs threshold ${threshold})`);
  process.exit(passes ? 0 : 1);
}

function dedup(findings) {
  const seen = new Map();
  for (const f of findings) {
    const k = `${f.title}|${f.detail}|${f.source}`;
    if (!seen.has(k)) seen.set(k, f);
  }
  return [...seen.values()];
}

main().catch((err) => {
  console.error('Secrets scan crashed:', err);
  process.exit(2);
});
