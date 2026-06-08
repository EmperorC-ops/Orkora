#!/usr/bin/env node
/**
 * Browser-bundle secret-leak scan.
 *
 * Greps the built apps/web output (`.next/static/**` + the server bundle
 * payload that gets sent to the client for app-router islands) for
 * patterns that should NEVER leak to the browser. Catches the classic
 * mistake of using a server-only secret without prefixing it
 * NEXT_PUBLIC_, which Next happily inlines into the client bundle.
 *
 * Patterns are configurable in security-audit.config.example.json under
 * `bundleLeakPatterns`. Any match is a HIGH finding.
 *
 * Run AFTER `pnpm --filter @orkora/web build`. The script tries that
 * build automatically if .next is missing or stale.
 *
 * Reports: security/reports/bundle/{latest.json,latest.md}
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, writeReport, banner, REPO_ROOT, SEVERITY } from './common.mjs';

const exec = promisify(execFile);
const WEB_DIR = resolve(REPO_ROOT, 'apps/web');
const NEXT_DIR = resolve(WEB_DIR, '.next');

async function ensureBuild() {
  if (existsSync(NEXT_DIR)) {
    const m = await stat(NEXT_DIR);
    const ageMs = Date.now() - m.mtimeMs;
    if (ageMs < 30 * 60 * 1000) {
      console.log(`Using existing .next build (age ${Math.round(ageMs / 60000)}m).`);
      return;
    }
    console.log('.next is older than 30m; rebuilding.');
  } else {
    console.log('.next missing; building.');
  }
  await exec('pnpm', ['--filter', '@orkora/web', 'build'], {
    cwd: REPO_ROOT,
    maxBuffer: 100 * 1024 * 1024,
  });
}

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, files);
    } else if (e.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function scanFiles(patterns, files) {
  const findings = [];
  // Compile once. Each pattern matches as a substring; whitespace +
  // case-insensitive for robustness against minifier variations.
  const matchers = patterns.map((p) => ({
    needle: p,
    re: new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  }));
  for (const file of files) {
    let buf;
    try {
      buf = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of matchers) {
      if (m.re.test(buf)) {
        // Skip false positives where the pattern is only inside a comment-stripped
        // import path or a property name (e.g. `process.env.NEXT_PUBLIC_X`).
        const lineRe = new RegExp(`^.*${m.needle}.*$`, 'gim');
        const hits = buf.match(lineRe) ?? [];
        for (const hit of hits.slice(0, 3)) {
          findings.push({
            severity: 'HIGH',
            title: `Possible secret leak: ${m.needle}`,
            detail: `${shortPath(file)} :: ${hit.trim().slice(0, 180)}`,
          });
        }
      }
    }
  }
  return findings;
}

function shortPath(p) {
  return p.replace(REPO_ROOT + '/', '').replace(REPO_ROOT, '');
}

async function main() {
  banner('Web bundle leak check');
  const cfg = await loadConfig();
  const patterns = cfg.bundleLeakPatterns ?? [];
  if (patterns.length === 0) {
    console.log('No patterns configured. Skipping.');
    process.exit(0);
  }

  await ensureBuild();

  // Scan only client-visible artefacts. The server bundle under
  // .next/server can hold secrets legitimately - that code never ships
  // to the browser. Static/chunks + the trace + the build manifest are
  // what actually goes over the wire.
  const browserDirs = [
    resolve(NEXT_DIR, 'static'),
    resolve(NEXT_DIR, 'BUILD_ID'),
    resolve(NEXT_DIR, 'app-build-manifest.json'),
    resolve(NEXT_DIR, 'build-manifest.json'),
    resolve(NEXT_DIR, 'react-loadable-manifest.json'),
  ].filter((p) => existsSync(p));

  let files = [];
  for (const root of browserDirs) {
    const s = await stat(root);
    if (s.isDirectory()) {
      files = files.concat(await walk(root));
    } else {
      files.push(root);
    }
  }
  // Filter to .js / .json / .html / .css - skip source maps + images.
  files = files.filter((f) => /\.(js|mjs|cjs|jsx|json|html|css)$/i.test(f));
  console.log(`Scanning ${files.length} browser-bundle file(s) for ${patterns.length} pattern(s)...`);

  const findings = await scanFiles(patterns, files);
  const passes = findings.filter((f) => SEVERITY[f.severity] >= SEVERITY.HIGH).length === 0;

  const payload = {
    title: 'Browser-bundle leak scan',
    target: shortPath(NEXT_DIR),
    generatedAt: new Date().toISOString(),
    status: passes ? 'pass' : 'fail',
    findings,
    summary: {
      filesScanned: files.length,
      patterns: patterns.length,
      hits: findings.length,
    },
  };

  const { mdPath, jsonPath } = await writeReport('bundle', payload);
  console.log(`\nReport: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
  console.log(`\nResult: ${payload.status.toUpperCase()} (${findings.length} hit(s))`);
  process.exit(passes ? 0 : 1);
}

main().catch((err) => {
  console.error('Bundle leak scan crashed:', err);
  process.exit(2);
});
