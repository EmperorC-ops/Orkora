/**
 * Shared helpers for the security harness scripts.
 *
 * Each script imports loadConfig() to resolve env:VAR_NAME placeholders
 * against process.env, and writeReport() to emit a JSON + Markdown
 * artefact under security/reports/<area>/. The harness deliberately
 * avoids any runtime deps so each script can run from a stock Node 20+
 * install with no extra install steps.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');
export const SECURITY_DIR = resolve(REPO_ROOT, 'security');
export const REPORTS_DIR = resolve(SECURITY_DIR, 'reports');

/**
 * Read the security audit config, preferring the gitignored local one
 * (security-audit.config.json) and falling back to the tracked example.
 * Resolves any string that begins with `env:` against process.env so
 * tokens never live in the file. Throws if a required env reference is
 * missing AND the caller declared it required.
 */
export async function loadConfig() {
  const local = resolve(SECURITY_DIR, 'security-audit.config.json');
  const example = resolve(SECURITY_DIR, 'security-audit.config.example.json');
  const path = existsSync(local) ? local : example;
  const raw = JSON.parse(await readFile(path, 'utf8'));
  return resolveEnv(raw);
}

function resolveEnv(node) {
  if (Array.isArray(node)) return node.map(resolveEnv);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveEnv(v);
    return out;
  }
  if (typeof node === 'string' && node.startsWith('env:')) {
    const name = node.slice(4);
    const v = process.env[name];
    return v ?? null;
  }
  return node;
}

/**
 * Write a JSON + Markdown pair into security/reports/<area>/. The JSON
 * is the machine-readable record CI consumes; the Markdown is what a
 * human reads after a failure.
 */
export async function writeReport(area, payload) {
  const dir = resolve(REPORTS_DIR, area);
  await mkdir(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = resolve(dir, `report-${ts}.json`);
  const mdPath = resolve(dir, `report-${ts}.md`);
  const latestJson = resolve(dir, 'latest.json');
  const latestMd = resolve(dir, 'latest.md');
  await writeFile(jsonPath, JSON.stringify(payload, null, 2));
  await writeFile(latestJson, JSON.stringify(payload, null, 2));
  const md = renderMarkdown(area, payload);
  await writeFile(mdPath, md);
  await writeFile(latestMd, md);
  return { jsonPath, mdPath };
}

function renderMarkdown(area, payload) {
  const lines = [];
  lines.push(`# ${payload.title ?? area} report`);
  lines.push('');
  lines.push(`Generated: ${payload.generatedAt ?? new Date().toISOString()}`);
  if (payload.target) lines.push(`Target: ${payload.target}`);
  lines.push('');
  lines.push(`## Status: ${payload.status ?? 'unknown'}`);
  lines.push('');
  if (Array.isArray(payload.findings) && payload.findings.length > 0) {
    lines.push(`## Findings (${payload.findings.length})`);
    lines.push('');
    for (const f of payload.findings) {
      lines.push(`- **${f.severity ?? 'INFO'}** ${f.title}`);
      if (f.detail) lines.push(`  - ${f.detail}`);
    }
    lines.push('');
  } else {
    lines.push('No findings.');
    lines.push('');
  }
  if (payload.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(payload.summary, null, 2));
    lines.push('```');
  }
  return lines.join('\n');
}

/**
 * Stable severity rank. Used by orchestrator to roll up multiple scripts
 * into one CI gate.
 */
export const SEVERITY = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function maxSeverity(findings) {
  let max = -1;
  for (const f of findings ?? []) {
    const s = SEVERITY[f.severity?.toUpperCase?.() ?? 'INFO'] ?? 0;
    if (s > max) max = s;
  }
  return max;
}

/**
 * Print a one-line section header so the CI log is scannable.
 */
export function banner(text) {
  const line = '='.repeat(72);
  console.log(`\n${line}\n  ${text}\n${line}`);
}
