import {
  collapseObfuscatedDots,
  isOneLineSubject,
  isPlainEmailAddress,
  safeFromName,
  safeHttpsUrl,
  sanitizeForEmail,
  validateDisplayText,
} from './text-safety';

const ZWSP = String.fromCodePoint(0x200b);
const RLO = String.fromCodePoint(0x202e);
const LINE_SEP = String.fromCodePoint(0x2028);
const FULLWIDTH_DOT = String.fromCodePoint(0xff0e);

describe('validateDisplayText: real names and titles pass (false-positive list)', () => {
  const people = [
    'Chukwuemeka Okonkwo',
    'Ọlátúnjí Adébáyọ̀',
    'Ngozi Ade-Ojo',
    "Tolu O'Neil",
    'Dr. Emmanuel Aihevba',
    'Engr. Babatunde A. Bello',
    'Mrs. Funmilayo Ransome-Kuti',
    'Aïssatou Diallo',
    'Jean-Baptiste Kouassi',
    'Hélène Mbappé',
    'Temitope Felix Sodeinde',
    'Pst. (Mrs) Ifeoma N. Eze',
  ];
  const orgs = [
    'Dangote Cement Plc',
    'Zenith Nig. Ltd',
    'Okafor & Sons Mfg. Co',
    'St. Leo Catholic Church',
    'Global Harvest Int’l Ministries',
    'Société Générale Côte d’Ivoire',
    'FACE Events Centre',
  ];
  const events = [
    'The Science of Transformational Leadership',
    'Leadership 2.0: What Comes Next',
    'Lagos Tech Summit 2026',
    'Instagram Live Masterclass',
    'Call Centre Excellence Training',
    'Class of 2006 Reunion',
  ];
  it.each(people)('accepts the person name %s', (n) => expect(validateDisplayText(n, 'person')).toBeNull());
  it.each(orgs)('accepts the organization %s', (n) => expect(validateDisplayText(n, 'organization')).toBeNull());
  it.each(events)('accepts the event %s', (n) => expect(validateDisplayText(n, 'event')).toBeNull());
});

describe('validateDisplayText: spam is refused', () => {
  const spam = [
    'Win now https://promo.example',
    'www.cheap-loans.ru',
    'Visit cheap.xyz today',
    'free money bit.ly/abc',
    'join t . me/promo',
    'go to promo[.]top',
    `promo${FULLWIDTH_DOT}xyz deals`,
    'cash dot com offer',
    'Call +234 801 234 5678',
    'WhatsApp: @earnfast',
    'Telegram @cryptokings',
    'Big Prize 🎁',
    `Hidden${ZWSP}text`,
    `Reverse${RLO}name`,
  ];
  it.each(spam)('refuses %s', (s) => expect(validateDisplayText(s, 'organization')).not.toBeNull());

  it('gives a reason the user can act on', () => {
    expect(validateDisplayText('www.x.com', 'person')).toBe('Names cannot contain links or web addresses.');
    expect(validateDisplayText('Ada 08012345678', 'person')).toBe('Names cannot contain phone numbers.');
  });
});

describe('sanitizeForEmail', () => {
  it('removes links, including obfuscated ones', () => {
    expect(sanitizeForEmail('Great event https://spam.example/x')).toBe('Great event [link removed]');
    expect(sanitizeForEmail('Visit promo[.]xyz now')).toBe('Visit [link removed] now');
    expect(sanitizeForEmail('see bit.ly/xyz')).toContain('[link removed]');
  });

  it('collapses newlines and strips invisible characters', () => {
    expect(sanitizeForEmail(`Line one\nLine two${LINE_SEP}three${ZWSP}`)).toBe('Line one Line two three');
  });

  it('caps the length after cleaning', () => {
    const out = sanitizeForEmail('a'.repeat(500), 50);
    expect(out.length).toBe(50);
    expect(out.endsWith('...')).toBe(true);
  });

  it('keeps ordinary names and abbreviations intact', () => {
    expect(sanitizeForEmail('Okafor & Sons Mfg. Co')).toBe('Okafor & Sons Mfg. Co');
    expect(sanitizeForEmail('Dr. Emmanuel Aihevba')).toBe('Dr. Emmanuel Aihevba');
  });

  it('handles empty values', () => {
    expect(sanitizeForEmail(null)).toBe('');
    expect(sanitizeForEmail(undefined)).toBe('');
  });
});

describe('isPlainEmailAddress (the recipient choke point)', () => {
  it('accepts one plain address', () => {
    expect(isPlainEmailAddress('ada@example.com')).toBe(true);
    expect(isPlainEmailAddress('ada.obi+events@mail.example.co.uk')).toBe(true);
  });

  it.each([
    'a@x.com, b@y.com',
    'a@x.com;b@y.com',
    'Ada <ada@x.com>',
    '"Ada" ada@x.com',
    'ada@x.com\nBcc: victim@y.com',
    ' ada@x.com',
    `ada${ZWSP}@x.com`,
    'not-an-email',
    'ada@localhost',
  ])('refuses %s', (v) => expect(isPlainEmailAddress(v)).toBe(false));
});

describe('isOneLineSubject', () => {
  it('accepts one line and refuses header breaks', () => {
    expect(isOneLineSubject('Your ticket is confirmed')).toBe(true);
    expect(isOneLineSubject('Hi\r\nBcc: x@y.com')).toBe(false);
    expect(isOneLineSubject('')).toBe(false);
    expect(isOneLineSubject('x'.repeat(201))).toBe(false);
  });
});

describe('safeFromName and safeHttpsUrl', () => {
  it('strips header-breaking characters from a From name', () => {
    const name = safeFromName('Acme "Events" <spam@x.com>');
    expect(name.startsWith('Acme Events')).toBe(true);
    expect(/["<>@,]|x\.com/.test(name)).toBe(false);
    expect(safeFromName('')).toBe('Orkora');
  });

  it('allows only https links in hrefs', () => {
    expect(safeHttpsUrl('https://zoom.us/j/123')).toBe('https://zoom.us/j/123');
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('http://insecure.example')).toBeNull();
    expect(safeHttpsUrl('https://user:pw@x.com')).toBeNull();
  });
});

describe('collapseObfuscatedDots', () => {
  it('folds the common disguises', () => {
    expect(collapseObfuscatedDots('promo [.] top')).toBe('promo.top');
    expect(collapseObfuscatedDots('promo (dot) top')).toBe('promo.top');
    expect(collapseObfuscatedDots('promo dot top')).toBe('promo.top');
  });
});

/**
 * Second pass after the independent review: names written without a space
 * after a dot, brand signs, "@Venue" in titles and "Platform: Title" must
 * pass; domains on any lowercase TLD, phone numbers and handles must not
 * survive into an email body.
 */
describe('review fixes: fewer false positives', () => {
  it.each(['Mrs.Idowu Adeyemi', 'Dr.Me Ade', 'St.Columba'])('accepts the person name %s', (n) =>
    expect(validateDisplayText(n, 'person')).toBeNull(),
  );
  it.each(['St.Cotton Ventures', 'Acme™ Ltd', 'Dangote® Group'])('accepts the organization %s', (n) =>
    expect(validateDisplayText(n, 'organization')).toBeNull(),
  );
  it.each([
    'Owambe Night @Eko Hotel',
    'Signal: The Future of Fintech',
    'TikTok: Creators Meetup Lagos',
    'Lagos.Live 2026',
    'Polka Dot Com Party',
    'Detty December ❤️ Lagos',
  ])('accepts the event %s', (n) => expect(validateDisplayText(n, 'event')).toBeNull());

  it('keeps such names intact in email bodies', () => {
    expect(sanitizeForEmail('St.Columba Church')).toBe('St.Columba Church');
    expect(sanitizeForEmail('Mrs.Idowu Adeyemi')).toBe('Mrs.Idowu Adeyemi');
  });
});

describe('review fixes: fewer misses', () => {
  it.each(['Cheap pills at pills.casino', 'Hall cheap-pills.bet', 'spam.casino/win', 'WIN.COM now', 'IG: promo_king', 'WhatsApp @deals'])(
    'refuses %s as an event title',
    (n) => expect(validateDisplayText(n, 'event')).not.toBeNull(),
  );

  it('strips unlisted-TLD domains, phone numbers and handles from email text', () => {
    const out = sanitizeForEmail('Hall cheap-pills.bet Call 0803 123 4567 WhatsApp @promo', 200);
    expect(out).not.toContain('cheap-pills.bet');
    expect(out).not.toMatch(/0803/);
    expect(out).not.toContain('@promo');
  });

  it("accepts addresses with RFC atext such as o'neil@", () => {
    expect(isPlainEmailAddress("o'neil@x.com")).toBe(true);
    expect(isPlainEmailAddress('a&b@x.com')).toBe(true);
    expect(isPlainEmailAddress('a@x.com:b')).toBe(false);
  });
});
