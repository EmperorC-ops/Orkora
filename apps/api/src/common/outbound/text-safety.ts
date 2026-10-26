/**
 * Text safety for anything that leaves Orkora as email or SMS.
 *
 * Background: on 2026-10-02 a bot abused another product's signup form by
 * putting a spam link in the company name, which the verification email then
 * carried to addresses the bot chose. These helpers make sure user-typed text
 * can never turn an Orkora email into an advert, and that every outbound
 * message has exactly one plain recipient.
 *
 * Invisible and look-alike characters are built from code points rather than
 * written into this file, so the source itself never contains them.
 */

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const range = (from: number, to: number) => {
  let s = '';
  for (let c = from; c <= to; c++) s += String.fromCodePoint(c);
  return s;
};
/** Escape a string for use inside a regex character class. */
const cls = (s: string) => s.replace(/[\\\]^-]/g, (m) => `\\${m}`);

/** C0/C1 controls, soft hyphen, zero-width, bidi controls, word joiners, BOM. */
const INVISIBLE_CHARS =
  range(0x00, 0x1f) +
  range(0x7f, 0x9f) +
  cp(0xad) +
  range(0x200b, 0x200f) +
  range(0x2028, 0x202e) +
  range(0x2060, 0x2064) +
  range(0x2066, 0x2069) +
  cp(0xfeff);
const INVISIBLE_RE = new RegExp(`[${cls(INVISIBLE_CHARS)}]`, 'g');
const INVISIBLE_TEST = new RegExp(`[${cls(INVISIBLE_CHARS)}]`);

/** Bidi overrides and isolates only (used to reject, not just strip). */
const BIDI_TEST = new RegExp(`[${cls(range(0x202a, 0x202e) + range(0x2066, 0x2069))}]`);

/** Characters that look like a dot: one dot leader, ideographic and fullwidth stops, middle dot. */
const LOOKALIKE_DOTS = new RegExp(`[${cls(cp(0x2024, 0x3002, 0xff0e, 0xff61, 0xb7, 0x2219))}]`, 'g');

const TLDS =
  'com|net|org|info|biz|xyz|top|site|online|link|click|live|shop|store|app|io|co|me|ru|cn|tk|ml|ga|cf|gq|buzz|cc|ly|gl|gg|to|us|uk|ng|gh|ke|za|tv|ai|pw|ws|win|bid|loan|work|vip|club|fun|icu|cyou|rest|sbs|lat|tokyo';

/** Shorteners and messaging hand-offs commonly used in spam. */
const SHORTENERS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  't.me',
  'wa.me',
  'goo.gl',
  'is.gd',
  'ow.ly',
  'cutt.ly',
  'rb.gy',
  'shorturl.at',
  'tiny.cc',
  'linktr.ee',
  'rebrand.ly',
  'buff.ly',
  's.id',
  'chat.whatsapp.com',
];

/**
 * Fold the tricks spammers use to hide a link: look-alike dots, "[.]", "(.)",
 * "{.}", " dot " and spaces around a dot all become a plain ".".
 */
export function collapseObfuscatedDots(s: string): string {
  return s
    .replace(LOOKALIKE_DOTS, '.')
    .replace(/\s*[[({]\s*(?:\.|dot)\s*[\])}]\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.')
    .replace(/\s+\.\s*(?=[a-z]{2,}\b)/gi, '.');
}

const URL_RE = new RegExp(String.raw`(?:https?:\/\/|www\.)\S+`, 'i');
// A bare domain written without spaces. Two shapes count, so that real
// names written without a space after a dot ("St.Columba", "Mrs.Idowu",
// "Lagos.Live 2026") are not mistaken for links:
//   - any host whose final label is lowercase letters ("cheap-pills.bet",
//     "Promo.casino/win", "x.co"), which is how links are written;
//   - an all-capitals host on a common TLD ("WIN.COM").
// "Mfg. Co" (space after the dot) and "St." are not domains.
const DOMAIN_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9.-])[A-Za-z0-9][A-Za-z0-9-]{0,62}(?:\.[A-Za-z0-9-]{1,63})*\.[a-z]{2,24}(?![A-Za-z0-9])` +
    '|' +
    String.raw`(?<![A-Za-z0-9.-])[A-Z0-9][A-Z0-9-]{0,62}(?:\.[A-Z0-9-]{1,63})*\.(?:${TLDS.toUpperCase()})(?![A-Za-z0-9])`,
);
const EMOJI_RE = /\p{Extended_Pictographic}/u;
// Trademark, registered and copyright signs are "pictographic" in Unicode but
// belong in business names.
const BRAND_SIGNS_RE = /[©®™]/g;
// Nine or more digits, allowing spaces, dots, dashes, brackets and a leading +.
const PHONE_RE = /(?:\+?\d[\s().-]*){9,}/;
// A messaging platform name. What follows decides whether it is a handle.
const PLATFORM_RE =
  /\b(?:telegram|whatsapp|watsapp|whatapp|insta(?:gram)?|ig|snap(?:chat)?|tiktok|signal|wechat|discord)\b/gi;
const AT_HANDLE_RE = /(^|\s)@[a-z0-9_.]{3,}/i;

/**
 * "WhatsApp @promo", "IG: promo_king", "Telegram: @deals" are handles.
 * "Instagram Live", "Signal: The Future of Fintech" and "TikTok: Creators
 * Meetup" are not: after "Platform:" a handle starts with @, or is written in
 * lowercase, or carries a digit, underscore or dot.
 */
function containsPlatformHandle(s: string): boolean {
  for (const m of s.matchAll(PLATFORM_RE)) {
    const rest = s.slice((m.index ?? 0) + m[0].length);
    if (/^\s*@\s*[A-Za-z0-9_.]{3,}/.test(rest)) return true;
    const colon = /^\s*:\s*(@?)([A-Za-z0-9_.]{3,})/.exec(rest);
    if (colon) {
      const [, at, token] = colon;
      if (at || /^[a-z0-9]/.test(token!) || /[0-9_.]/.test(token!)) return true;
    }
  }
  return false;
}

/** Shorteners matched as whole hosts, so "St.Columba" is not "t.co". */
const SHORTENER_RES = SHORTENERS.map(
  (d) => new RegExp(String.raw`(?<![A-Za-z0-9])${d.replace(/\./g, '\\.')}(?![A-Za-z0-9])`, 'gi'),
);

export type DisplayTextKind = 'person' | 'organization' | 'event' | 'venue' | 'ticket';

/**
 * Validate a name or title typed by a user that may later appear in an email.
 * Returns a short reason the user can act on, or null when the text is fine.
 * Tuned for real Nigerian, West African and French names and business names:
 * accents, apostrophes, hyphens, "Ltd.", "Nig. Ltd", "Mfg. Co", "St." pass.
 */
export function validateDisplayText(raw: string, kind: DisplayTextKind): string | null {
  const s = String(raw ?? '').slice(0, 1000);
  if (INVISIBLE_TEST.test(s) || BIDI_TEST.test(s)) {
    return 'Remove hidden or control characters.';
  }
  const label =
    kind === 'person'
      ? 'Names'
      : kind === 'organization'
        ? 'Organization names'
        : kind === 'venue'
          ? 'Venue details'
          : kind === 'ticket'
            ? 'Ticket names'
            : 'Event titles';
  // Emoji are refused in personal and organization names (brand signs such
  // as the trademark sign are allowed); event titles may use them.
  if ((kind === 'person' || kind === 'organization') && EMOJI_RE.test(s.replace(BRAND_SIGNS_RE, ''))) return `${label} cannot contain emoji.`;
  const folded = collapseObfuscatedDots(s);
  if (URL_RE.test(folded) || DOMAIN_RE.test(folded)) return `${label} cannot contain links or web addresses.`;
  if (SHORTENER_RES.some((re) => new RegExp(re.source, 'i').test(folded))) {
    return `${label} cannot contain links or web addresses.`;
  }
  if (PHONE_RE.test(s)) return `${label} cannot contain phone numbers.`;
  if (containsPlatformHandle(s)) return `${label} cannot contain social media handles.`;
  // "@Eko Hotel" is a fine event title; a bare @handle in a name is not.
  if ((kind === 'person' || kind === 'organization') && AT_HANDLE_RE.test(s)) {
    return `${label} cannot contain social media handles.`;
  }
  return null;
}

/**
 * Make user-typed text safe to show inside an email body: slice first (so no
 * regex ever runs on a huge input), drop invisible characters, collapse
 * whitespace and newlines, remove anything link-like, then cap the length.
 * Used for names, titles and venues in outbound mail even when they passed
 * validation, because older records were never validated.
 */
export function sanitizeForEmail(raw: string | null | undefined, max = 120): string {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).slice(0, max * 4);
  s = s.normalize('NFKC').replace(INVISIBLE_RE, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const folded = collapseObfuscatedDots(s);
  if (folded !== s && (DOMAIN_RE.test(folded) || URL_RE.test(folded))) s = folded;
  s = s.replace(new RegExp(URL_RE.source, 'gi'), '[link removed]');
  s = s.replace(new RegExp(DOMAIN_RE.source, 'g'), '[link removed]');
  for (const re of SHORTENER_RES) s = s.replace(new RegExp(re.source, 'gi'), '[link removed]');
  // Phone numbers and messaging handles are how spam asks to be contacted.
  s = s.replace(new RegExp(PHONE_RE.source, 'g'), '[number removed] ');
  if (containsPlatformHandle(s)) {
    s = s.replace(/(^|\s)@[A-Za-z0-9_.]{3,}/g, '$1[handle removed]');
    s = s.replace(
      /(\b(?:telegram|whatsapp|watsapp|whatapp|insta(?:gram)?|ig|snap(?:chat)?|tiktok|signal|wechat|discord)\b\s*:\s*)[A-Za-z0-9_.]{3,}/gi,
      '$1[handle removed]',
    );
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = `${s.slice(0, max - 3).trimEnd()}...`;
  return s;
}

/**
 * Exactly one plain email address: no display name, no lists, no whitespace,
 * no header breaks, no invisible characters. The single choke point for every
 * recipient Orkora sends to.
 */
export function isPlainEmailAddress(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  if (raw.length < 3 || raw.length > 254) return false;
  if (INVISIBLE_TEST.test(raw)) return false;
  // Anything that could start a second address or a display name.
  if (/[\s,;<>"()[\]\\:]/.test(raw)) return false;
  // RFC 5322 atext in the local part (so o'neil@ and a&b@ work), a plain
  // dotted host with a letter TLD.
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(raw);
}

/** One line, printable, at most 200 characters. */
export function isOneLineSubject(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  if (raw.length === 0 || raw.length > 200) return false;
  return !INVISIBLE_TEST.test(raw);
}

/** A display name safe inside a From header: no quotes, brackets, commas or links. */
export function safeFromName(raw: string | null | undefined, fallback = 'Orkora'): string {
  // Drop anything shaped like an address first, so "Bank <ceo@bank.co>" cannot
  // leave "ceobank.co" behind once the punctuation goes.
  const s = sanitizeForEmail(String(raw ?? '').replace(/\S*@\S*/g, ' '), 60)
    .replace(/["<>,;:@\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || fallback;
}

/** An https URL safe to place in an href, or null. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.length > 2000 || INVISIBLE_TEST.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * The single envelope check every outbound email passes: exactly one plain
 * recipient and a one-line subject. Throws, so a bad envelope can never reach
 * the provider whichever code path built it.
 */
export function assertSafeEnvelope(to: unknown, subject: unknown): void {
  if (!isPlainEmailAddress(to)) {
    throw new Error('Refused to send: recipient must be exactly one plain email address');
  }
  if (!isOneLineSubject(subject)) {
    throw new Error('Refused to send: subject must be a single line of at most 200 characters');
  }
}

/** Default SMS destinations: Nigeria, Ghana, Kenya, South Africa. */
export const DEFAULT_SMS_COUNTRY_CODES = ['234', '233', '254', '27'];

/**
 * Normalise a phone number to E.164 and allow only the countries Orkora
 * serves. Returns the E.164 string, or null when it must not be texted.
 */
export function normalizeSmsDestination(raw: unknown, allowedCountryCodes = DEFAULT_SMS_COUNTRY_CODES): string | null {
  if (typeof raw !== 'string') return null;
  if (INVISIBLE_TEST.test(raw) || raw.length > 32) return null;
  const compact = raw.replace(/[\s().-]/g, '');
  if (!/^\+\d{8,15}$/.test(compact)) return null;
  const digits = compact.slice(1);
  if (!allowedCountryCodes.some((cc) => digits.startsWith(cc))) return null;
  return compact;
}
