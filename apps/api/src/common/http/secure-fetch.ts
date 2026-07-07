/**
 * SecureFetch - SSRF-safe outbound HTTP for fetching USER-SUPPLIED URLs.
 *
 * Hardcoded vendor URLs (Postmark, Stripe, Paystack, Flutterwave, Google
 * OAuth certs, Apple JWKs) bypass this and use plain `fetch()` directly;
 * they aren't an SSRF risk because the host isn't attacker-controlled.
 *
 * Every place that fetches a URL we got from a request body, query
 * parameter, or other user input MUST go through here. Rules enforced:
 *
 *   - https only (no http, no file:, no data:, no ftp:, no gopher:)
 *   - hostname must resolve to a public IP - reject loopback,
 *     link-local, private, multicast, broadcast, CGNAT, unspecified
 *   - redirects disabled (a redirect to a private IP defeats the
 *     pre-resolution check)
 *   - 5-second connect timeout, 10-second total
 *   - response body capped at 10 MB
 *
 * Audited in SECURITY_REVIEW_2026-05-30.md §18. Required reading before
 * adding any new outbound HTTP that touches user input.
 */

import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

const PRIVATE_CIDRS = [
  // IPv4
  { net: '10.0.0.0',     mask: 8 },
  { net: '172.16.0.0',   mask: 12 },
  { net: '192.168.0.0',  mask: 16 },
  { net: '127.0.0.0',    mask: 8 },   // loopback
  { net: '169.254.0.0',  mask: 16 },  // link-local
  { net: '100.64.0.0',   mask: 10 },  // CGNAT
  { net: '0.0.0.0',      mask: 8 },   // unspecified
  { net: '224.0.0.0',    mask: 4 },   // multicast
  { net: '240.0.0.0',    mask: 4 },   // reserved
];

const DEFAULTS = {
  connectTimeoutMs: 5_000,
  totalTimeoutMs: 10_000,
  maxBytes: 10 * 1024 * 1024,
};

export interface SecureFetchOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBytes?: number;
}

export class SecureFetchError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'SecureFetchError';
  }
}

/**
 * Fetch a USER-SUPPLIED URL with SSRF protections. Returns the body
 * as a Buffer plus the response metadata. Throws SecureFetchError if
 * any guard trips.
 */
export async function secureFetch(
  rawUrl: string,
  opts: SecureFetchOptions = {},
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const o = { ...DEFAULTS, ...opts };

  // 1. URL parse + scheme allowlist
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SecureFetchError('Invalid URL', 'invalid-url');
  }
  if (url.protocol !== 'https:') {
    throw new SecureFetchError(`Refused scheme ${url.protocol}; https only`, 'bad-scheme');
  }

  // 2. DNS resolution + private-range check
  const host = url.hostname;
  // For IPv6 literals, URL.hostname keeps the surrounding square brackets
  // (e.g. '[::1]'). net.isIP() and our range checks need the bare address,
  // so strip them here while leaving `url` untouched for the actual fetch.
  const bareHost =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  let addresses: string[];
  if (isIP(bareHost)) {
    addresses = [bareHost];
  } else {
    try {
      const records = await dns.lookup(bareHost, { all: true });
      addresses = records.map((r) => r.address);
    } catch (err) {
      throw new SecureFetchError(`DNS resolution failed for ${bareHost}`, 'dns-fail');
    }
  }
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new SecureFetchError(
        `Refused: ${host} resolves to private/reserved address ${addr}`,
        'private-address',
      );
    }
  }

  // 3. Fetch with redirect manual + timeouts
  const ctrl = new AbortController();
  const total = setTimeout(() => ctrl.abort(), o.totalTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      redirect: 'manual',
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(total);
    throw new SecureFetchError(`Fetch failed: ${err instanceof Error ? err.message : err}`, 'fetch-fail');
  }

  // Manual redirect = response with 3xx, body present. We refuse redirects
  // because the destination might resolve to a private address that
  // bypasses our pre-resolution check.
  if (res.status >= 300 && res.status < 400) {
    clearTimeout(total);
    throw new SecureFetchError(`Refused: redirect to ${res.headers.get('location')}`, 'redirect');
  }

  // 4. Body cap
  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > o.maxBytes) {
    clearTimeout(total);
    throw new SecureFetchError(`Refused: response too large (${contentLength} > ${o.maxBytes})`, 'too-large');
  }

  const reader = res.body?.getReader();
  if (!reader) {
    clearTimeout(total);
    return {
      status: res.status,
      headers: headersToObject(res.headers),
      body: Buffer.alloc(0),
    };
  }
  const chunks: Uint8Array[] = [];
  let total_bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total_bytes += value.byteLength;
      if (total_bytes > o.maxBytes) {
        await reader.cancel();
        throw new SecureFetchError(`Refused: streamed body exceeds ${o.maxBytes}`, 'too-large');
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(total);
  }

  return {
    status: res.status,
    headers: headersToObject(res.headers),
    body: Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))),
  };
}

function headersToObject(h: Headers): Record<string, string> {
  const o: Record<string, string> = {};
  h.forEach((v, k) => (o[k] = v));
  return o;
}

function isPrivateAddress(addr: string): boolean {
  // IPv6: explicit loopback + link-local + unique-local
  if (addr.includes(':')) {
    const lower = addr.toLowerCase();
    if (lower === '::1') return true;                  // loopback
    if (lower.startsWith('fe80:')) return true;         // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
    if (lower === '::') return true;                   // unspecified
    if (lower.startsWith('ff')) return true;           // multicast
    return false;
  }
  // IPv4 CIDR check
  const ip = ipv4ToInt(addr);
  if (ip === null) return true; // unparseable -> reject
  for (const { net, mask } of PRIVATE_CIDRS) {
    const netInt = ipv4ToInt(net);
    if (netInt === null) continue;
    const maskBits = ~0 << (32 - mask);
    if ((ip & maskBits) === (netInt & maskBits)) return true;
  }
  return false;
}

function ipv4ToInt(addr: string): number | null {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0; // unsigned
}
