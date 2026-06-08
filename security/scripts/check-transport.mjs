#!/usr/bin/env node
/**
 * Transport posture check.
 *
 * Verifies for the configured appBaseUrl + apiBaseUrl:
 *   - The URL uses HTTPS (skipped for localhost).
 *   - An HTTP request to the same host redirects to HTTPS.
 *   - A successful HTTPS response carries `Strict-Transport-Security`.
 *   - Any `Set-Cookie` returned uses HttpOnly + Secure + SameSite.
 *
 * The check is INFORMATIONAL by default for transport.expectHsts /
 * expectSecureCookies / expectHttpRedirect = false (good for local dev).
 * In CI against staging or prod, set the expect flags to true; missing
 * markers then graduate to MEDIUM / HIGH findings and gate the run.
 *
 * Usage:
 *   node security/scripts/check-transport.mjs
 *
 * Exit codes:
 *   0 = pass (no findings above MEDIUM)
 *   1 = fail (one or more HIGH/CRITICAL findings, or hard failure)
 */

import { loadConfig, writeReport, banner, maxSeverity, SEVERITY } from './common.mjs';

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'manual' });
  } finally {
    clearTimeout(t);
  }
}

function parseSetCookie(value) {
  // node fetch returns a comma-joined header for multiple cookies; split
  // on `, ` only when followed by a token=, so we don't break on Expires
  // dates that contain commas.
  const parts = String(value).split(/,(?=\s*[A-Za-z_][\w-]*=)/);
  return parts.map((c) => c.trim());
}

function isLocalhost(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.local');
  } catch {
    return false;
  }
}

async function checkOne(label, url, expect) {
  const findings = [];

  if (!url) {
    findings.push({
      severity: 'HIGH',
      title: `${label} URL not configured`,
      detail: 'appBaseUrl or apiBaseUrl resolved to null. Set APP_BASE_URL / API_BASE_URL in env.',
    });
    return { url: null, findings };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    findings.push({ severity: 'HIGH', title: `${label} URL is malformed`, detail: url });
    return { url, findings };
  }

  const local = isLocalhost(url);

  // HTTPS check
  if (parsed.protocol !== 'https:' && !local) {
    findings.push({
      severity: 'HIGH',
      title: `${label} is not HTTPS`,
      detail: `Got ${parsed.protocol}//${parsed.hostname}. Production and staging must serve over HTTPS.`,
    });
  } else if (parsed.protocol !== 'https:' && local) {
    findings.push({
      severity: 'INFO',
      title: `${label} uses HTTP (localhost; skipping TLS checks)`,
    });
  }

  // HTTP -> HTTPS redirect (only meaningful for HTTPS prod URLs)
  if (expect.expectHttpRedirect && parsed.protocol === 'https:') {
    try {
      const httpUrl = `http://${parsed.hostname}${parsed.pathname || '/'}`;
      const r = await fetchWithTimeout(httpUrl);
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location') ?? '';
        if (!loc.startsWith('https://')) {
          findings.push({
            severity: 'HIGH',
            title: `${label}: HTTP did not redirect to HTTPS`,
            detail: `Got ${r.status} Location: ${loc}`,
          });
        }
      } else {
        findings.push({
          severity: 'MEDIUM',
          title: `${label}: HTTP did not return a redirect`,
          detail: `Expected 3xx, got ${r.status}. Some CDNs answer HTTP with a security page; verify manually.`,
        });
      }
    } catch (err) {
      // Connection refused on port 80 is acceptable - means HTTP is
      // simply not served at all, which is even better than a redirect.
      findings.push({
        severity: 'INFO',
        title: `${label}: HTTP unreachable (this is fine)`,
        detail: String(err?.message ?? err),
      });
    }
  }

  // HTTPS response + headers
  if (parsed.protocol === 'https:') {
    try {
      const r = await fetchWithTimeout(url);
      const hsts = r.headers.get('strict-transport-security');
      if (expect.expectHsts && !hsts) {
        findings.push({
          severity: 'HIGH',
          title: `${label}: missing Strict-Transport-Security header`,
          detail: 'Browsers will allow downgrade attacks. Add HSTS with max-age >= 15552000 and includeSubDomains.',
        });
      } else if (hsts) {
        // sanity-check directives
        const maxAge = /max-age=(\d+)/i.exec(hsts);
        if (!maxAge || Number(maxAge[1]) < 15_552_000) {
          findings.push({
            severity: 'MEDIUM',
            title: `${label}: HSTS max-age below 180 days`,
            detail: `Got: ${hsts}`,
          });
        }
      }

      // Cookies
      const cookies = r.headers.get('set-cookie');
      if (cookies && expect.expectSecureCookies) {
        for (const c of parseSetCookie(cookies)) {
          const name = c.split('=')[0];
          const flags = c.toLowerCase();
          // Refresh-style cookies must be httpOnly + secure + sameSite
          const sensitiveLike = /(_rt|refresh|session|sid|sso|orkora_rt)/i.test(name);
          if (sensitiveLike) {
            if (!flags.includes('httponly')) {
              findings.push({
                severity: 'HIGH',
                title: `${label}: cookie ${name} missing HttpOnly`,
                detail: c,
              });
            }
            if (!flags.includes('secure')) {
              findings.push({
                severity: 'HIGH',
                title: `${label}: cookie ${name} missing Secure`,
                detail: c,
              });
            }
            if (!/samesite=/i.test(c)) {
              findings.push({
                severity: 'MEDIUM',
                title: `${label}: cookie ${name} missing SameSite`,
                detail: c,
              });
            }
          }
        }
      }
    } catch (err) {
      findings.push({
        severity: 'MEDIUM',
        title: `${label}: HTTPS fetch failed`,
        detail: String(err?.message ?? err),
      });
    }
  }

  return { url, findings };
}

async function main() {
  banner('Transport security check');
  const cfg = await loadConfig();
  const expect = cfg.transport ?? {};

  const app = await checkOne('appBaseUrl', cfg.appBaseUrl, expect);
  const api = await checkOne('apiBaseUrl', cfg.apiBaseUrl, expect);

  const findings = [...app.findings, ...api.findings];
  const max = maxSeverity(findings);
  const passes = max < SEVERITY.HIGH;

  const payload = {
    title: 'Transport posture',
    target: `${cfg.appBaseUrl ?? '?'} + ${cfg.apiBaseUrl ?? '?'}`,
    generatedAt: new Date().toISOString(),
    status: passes ? 'pass' : 'fail',
    findings,
    summary: {
      appBaseUrl: cfg.appBaseUrl,
      apiBaseUrl: cfg.apiBaseUrl,
      maxSeverity: Object.keys(SEVERITY).find((k) => SEVERITY[k] === max) ?? 'INFO',
      counts: countBySeverity(findings),
      expectations: expect,
    },
  };

  const { mdPath, jsonPath } = await writeReport('transport', payload);
  console.log(`\nReport: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
  console.log(`\nResult: ${payload.status.toUpperCase()} (max severity ${payload.summary.maxSeverity})`);
  process.exit(passes ? 0 : 1);
}

function countBySeverity(findings) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) counts[(f.severity ?? 'INFO').toUpperCase()] = (counts[(f.severity ?? 'INFO').toUpperCase()] ?? 0) + 1;
  return counts;
}

main().catch((err) => {
  console.error('Transport check crashed:', err);
  process.exit(2);
});
