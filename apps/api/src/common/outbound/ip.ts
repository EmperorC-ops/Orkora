import { isIP } from 'net';

/**
 * A stable rate-limit key for a client address. IPv4-mapped IPv6
 * ("::ffff:1.2.3.4") becomes plain IPv4. IPv6 is keyed on its /64 network,
 * because one household or phone usually holds a whole /64 and can rotate
 * addresses inside it freely. Anything unparseable becomes "unknown".
 */
export function rateLimitIpKey(raw: string | null | undefined): string {
  if (!raw) return 'unknown';
  let ip = String(raw).trim();
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1]!;
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) return 'unknown';
  const groups = expandIpv6(ip);
  if (!groups) return 'unknown';
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/** The /48 network of an IPv6 address, or null for IPv4 and junk. */
export function ipv6Slash48(raw: string | null | undefined): string | null {
  const key = rateLimitIpKey(raw);
  if (!key.endsWith('::/64')) return null;
  return `${key.split(':').slice(0, 3).join(':')}::/48`;
}

/**
 * Cap keys for a client address. IPv4 and an IPv6 /64 get `limit`. IPv6 also
 * gets its /48 at four times the limit, because one VPS or tunnel allocation
 * (a /48 or /56) holds many /64s an attacker can rotate through.
 */
export function ipCapKeys(
  ip: string | null | undefined,
  limit: number,
  windowSeconds: number,
): Array<{ name: string; value: string; limit: number; windowSeconds: number }> {
  if (!ip || ip === 'unknown') return [];
  const keys = [{ name: 'ip', value: rateLimitIpKey(ip), limit, windowSeconds }];
  const wide = ipv6Slash48(ip);
  if (wide) keys.push({ name: 'ip48', value: wide, limit: limit * 4, windowSeconds });
  return keys;
}

/**
 * The inbox an address really lands in, for cap keys only (never for
 * sending): lowercased, "+tag" removed, and for Gmail the dots in the local
 * part removed. So a.b+1@gmail.com and ab+2@gmail.com share one cap.
 */
export function emailCapKey(raw: string): string {
  const e = String(raw ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Eight 4-digit lowercase hex groups, or null. */
function expandIpv6(ip: string): string[] | null {
  let s = ip.toLowerCase();
  const pct = s.indexOf('%');
  if (pct >= 0) s = s.slice(0, pct);
  // Embedded IPv4 tail (for example ::1.2.3.4) becomes two hex groups.
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const n = v4.slice(1).map(Number);
    const hex = [((n[0]! << 8) | n[1]!).toString(16), ((n[2]! << 8) | n[3]!).toString(16)];
    s = s.slice(0, v4.index) + hex.join(':');
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => g.padStart(4, '0'));
}

/**
 * Client address from an Express request. Uses req.ip, which Express derives
 * from 'trust proxy' (main.ts); never the leftmost X-Forwarded-For entry,
 * which the client controls.
 */
export function requestIp(req: { ip?: string } | undefined): string {
  return req?.ip || 'unknown';
}
