#!/usr/bin/env node
/**
 * Dependency vulnerability audit.
 *
 * Always runs `pnpm audit` (per the lockfile committed in this repo).
 * If SNYK_TOKEN is present in env, ALSO runs Snyk and merges findings.
 * Snyk catches advisories that have not yet propagated to the pnpm /
 * GitHub advisory database, so the two together are stronger than
 * either alone. If Snyk fails or the CLI is unavailable, the run
 * silently falls back to pnpm-audit only (logged as INFO).
 *
 * Severity gate: HIGH or CRITICAL findings against production deps
 * gate CI. MODERATE+LOW findings are reported but do not gate, so we
 * do not chase noise from transitives we never hit at runtime.
 *
 * Reports: security/reports/dependencies/{latest.json,latest.md}
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, writeReport, banner, SEVERITY } from './common.mjs';

const exec = promisify(execFile);

async function runPnpmAudit() {
  // --prod restricts to runtime dependencies. We invoke as JSON so we
  // can parse and structure findings instead of grepping log output.
  const findings = [];
  try {
    const { stdout } = await exec('pnpm', ['audit', '--prod', '--json'], {
      maxBuffer: 50 * 1024 * 1024,
    });
    const advisories = parsePnpmJson(stdout);
    for (const adv of advisories) {
      findings.push({
        severity: adv.severity?.toUpperCase?.() ?? 'INFO',
        title: `${adv.module_name ?? adv.name ?? 'unknown'}: ${adv.title ?? adv.overview?.slice(0, 80) ?? 'advisory'}`,
        detail:
          adv.recommendation ??
          adv.fixed_in ??
          (adv.url ? `See ${adv.url}` : 'See pnpm audit --json for full payload.'),
        source: 'pnpm-audit',
        advisory: adv.id ?? adv.ghsa ?? adv.cves?.[0],
      });
    }
  } catch (err) {
    // pnpm exits non-zero when vulns are found. stderr/stdout still contain JSON.
    const out = err?.stdout ?? '';
    if (out) {
      try {
        const advisories = parsePnpmJson(out);
        for (const adv of advisories) {
          findings.push({
            severity: adv.severity?.toUpperCase?.() ?? 'INFO',
            title: `${adv.module_name ?? adv.name ?? 'unknown'}: ${adv.title ?? adv.overview?.slice(0, 80) ?? 'advisory'}`,
            detail: adv.recommendation ?? adv.url ?? 'See pnpm audit --json',
            source: 'pnpm-audit',
            advisory: adv.id ?? adv.ghsa ?? adv.cves?.[0],
          });
        }
      } catch {
        findings.push({
          severity: 'MEDIUM',
          title: 'pnpm audit produced unparseable output',
          detail: String(err?.message ?? err).slice(0, 400),
          source: 'pnpm-audit',
        });
      }
    } else {
      findings.push({
        severity: 'MEDIUM',
        title: 'pnpm audit invocation failed',
        detail: String(err?.message ?? err).slice(0, 400),
        source: 'pnpm-audit',
      });
    }
  }
  return findings;
}

function parsePnpmJson(text) {
  // pnpm emits one JSON document at the end with `advisories` keyed by ID.
  // It sometimes also emits per-line progress. Take the LAST '{' through end.
  const idx = text.lastIndexOf('{');
  if (idx < 0) return [];
  try {
    const obj = JSON.parse(text.slice(idx));
    const advs = obj.advisories ?? {};
    return Object.values(advs);
  } catch {
    return [];
  }
}

async function runSnyk() {
  if (!process.env.SNYK_TOKEN) {
    return { available: false, findings: [] };
  }
  try {
    const { stdout } = await exec('snyk', ['test', '--all-projects', '--json'], {
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env },
    });
    return { available: true, findings: parseSnykJson(stdout) };
  } catch (err) {
    const out = err?.stdout ?? '';
    if (out) {
      return { available: true, findings: parseSnykJson(out) };
    }
    return {
      available: true,
      error: String(err?.message ?? err).slice(0, 400),
      findings: [],
    };
  }
}

function parseSnykJson(text) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const projects = Array.isArray(parsed) ? parsed : [parsed];
  for (const p of projects) {
    for (const v of p.vulnerabilities ?? []) {
      findings.push({
        severity: v.severity?.toUpperCase?.() ?? 'INFO',
        title: `${v.packageName}@${v.version}: ${v.title}`,
        detail: v.fixedIn?.length
          ? `Fixed in ${v.fixedIn.join(', ')}`
          : v.url ?? 'No fix available',
        source: 'snyk',
        advisory: v.id,
      });
    }
  }
  return findings;
}

async function main() {
  banner('Dependency vulnerability audit');
  const cfg = await loadConfig();
  const threshold = cfg.thresholds?.depsHighOrCritical ?? 0;

  const pnpmFindings = await runPnpmAudit();
  console.log(`pnpm audit: ${pnpmFindings.length} finding(s)`);

  const snyk = await runSnyk();
  if (snyk.available) {
    console.log(`snyk:       ${snyk.findings.length} finding(s)`);
  } else {
    console.log('snyk:       not configured (SNYK_TOKEN missing)');
  }

  // Deduplicate by advisory id (a CVE picked up by both tools is still one issue)
  const all = [...pnpmFindings, ...snyk.findings];
  const seen = new Map();
  for (const f of all) {
    const key = f.advisory ?? f.title;
    if (!seen.has(key)) seen.set(key, f);
  }
  const findings = [...seen.values()];

  const highOrCritical = findings.filter(
    (f) => SEVERITY[f.severity] >= SEVERITY.HIGH,
  );
  const passes = highOrCritical.length <= threshold;

  const payload = {
    title: 'Dependency audit',
    target: 'pnpm-lock.yaml',
    generatedAt: new Date().toISOString(),
    status: passes ? 'pass' : 'fail',
    findings,
    summary: {
      total: findings.length,
      highOrCritical: highOrCritical.length,
      threshold,
      sources: {
        pnpm: pnpmFindings.length,
        snyk: snyk.available ? snyk.findings.length : 'skipped',
      },
      counts: countBySeverity(findings),
    },
  };

  const { mdPath, jsonPath } = await writeReport('dependencies', payload);
  console.log(`\nReport: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
  console.log(`\nResult: ${payload.status.toUpperCase()} (${highOrCritical.length} high+/critical vs threshold ${threshold})`);
  process.exit(passes ? 0 : 1);
}

function countBySeverity(findings) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) {
    const s = (f.severity ?? 'INFO').toUpperCase();
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

main().catch((err) => {
  console.error('Dependency check crashed:', err);
  process.exit(2);
});
