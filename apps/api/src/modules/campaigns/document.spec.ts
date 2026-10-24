import {
  acceptDocumentUrl,
  documentRecipientKey,
  formatDocumentSize,
  renderDocumentBlock,
  sanitizeDocumentName,
} from './document';

const BASE = 'https://cdn.orkora.events';

describe('acceptDocumentUrl', () => {
  it('accepts one of our uploaded PDFs', () => {
    expect(acceptDocumentUrl(`${BASE}/campaign_documents/u1/abc-123.pdf`, BASE)).toBe(
      `${BASE}/campaign_documents/u1/abc-123.pdf`,
    );
  });

  it('refuses other hosts, folders, types, queries and http', () => {
    expect(acceptDocumentUrl('https://evil.example/campaign_documents/u1/a.pdf', BASE)).toBeNull();
    expect(acceptDocumentUrl(`${BASE}/campaign_flyers/u1/a.pdf`, BASE)).toBeNull();
    expect(acceptDocumentUrl(`${BASE}/campaign_documents/u1/a.exe`, BASE)).toBeNull();
    expect(acceptDocumentUrl(`${BASE}/campaign_documents/u1/a.pdf?x=1`, BASE)).toBeNull();
    expect(acceptDocumentUrl(`http://cdn.orkora.events/campaign_documents/u1/a.pdf`, BASE)).toBeNull();
    expect(acceptDocumentUrl(`${BASE}/campaign_documents/../../a.pdf`, BASE)).toBeNull();
  });
});

describe('sanitizeDocumentName', () => {
  it('keeps a normal name and forces .pdf', () => {
    expect(sanitizeDocumentName('October Newsletter.pdf')).toBe('October Newsletter.pdf');
    expect(sanitizeDocumentName('Programme (Day 1)')).toBe('Programme (Day 1).pdf');
  });

  it('strips paths, markup and control characters', () => {
    expect(sanitizeDocumentName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    expect(sanitizeDocumentName('<b>x</b>.pdf')).toBe('b.pdf');
    expect(sanitizeDocumentName('a <b> c.pdf')).toBe('a b c.pdf');
    expect(sanitizeDocumentName('bad\u0000\nname.pdf')).toBe('bad name.pdf');
  });

  it('falls back and caps the length', () => {
    expect(sanitizeDocumentName('')).toBe('document.pdf');
    expect(sanitizeDocumentName(`${'a'.repeat(200)}.pdf`).length).toBeLessThanOrEqual(80);
  });

  it('keeps accented letters', () => {
    expect(sanitizeDocumentName('Bulletin d’été.pdf')).toBe('Bulletin d été.pdf');
  });
});

describe('documentRecipientKey', () => {
  it('is stable, case-insensitive on email, 22 url-safe characters', () => {
    const a = documentRecipientKey('pepper', 'c1', 'Ada@Example.com');
    const b = documentRecipientKey('pepper', 'c1', 'ada@example.com ');
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('differs per campaign and per recipient', () => {
    expect(documentRecipientKey('p', 'c1', 'a@x.com')).not.toBe(documentRecipientKey('p', 'c2', 'a@x.com'));
    expect(documentRecipientKey('p', 'c1', 'a@x.com')).not.toBe(documentRecipientKey('p', 'c1', 'b@x.com'));
  });
});

describe('renderDocumentBlock', () => {
  it('escapes the name and shows the size', () => {
    const html = renderDocumentBlock({ href: 'https://api.orkora.events/v1/c/doc/1?r=k', name: 'A & B "x".pdf', sizeBytes: 1536000 });
    expect(html).toContain('A &amp; B &quot;x&quot;.pdf');
    expect(html).toContain('1.5 MB');
    expect(html).toContain('Download PDF');
  });

  it('formats sizes', () => {
    expect(formatDocumentSize(0)).toBe('');
    expect(formatDocumentSize(2048)).toBe('2 KB');
  });
});
