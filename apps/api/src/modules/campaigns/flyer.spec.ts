import { acceptFlyerUrl, renderFlyerBlock } from './flyer';

/**
 * The flyer URL rule keeps bulk mail from Orkora's domain free of third-party
 * images and links: only https URLs on our media host under campaign_flyers/
 * are accepted, exactly what the upload flow produces.
 */
describe('acceptFlyerUrl', () => {
  const BASE = 'https://cdn.orkora.events';
  const USER = '0192a7b4-1c2d-7e3f-8a9b-0c1d2e3f4a5b';
  const FILE = '6f1e2d3c-4b5a-4968-8776-655443322110';
  const good = `${BASE}/campaign_flyers/${USER}/${FILE}.png`;

  it('accepts an uploaded flyer on our media host', () => {
    expect(acceptFlyerUrl(good, BASE)).toBe(good);
  });

  it('accepts jpg and webp, and a base URL with a trailing slash', () => {
    expect(acceptFlyerUrl(`${BASE}/campaign_flyers/${USER}/${FILE}.jpg`, `${BASE}/`)).not.toBeNull();
    expect(acceptFlyerUrl(`${BASE}/campaign_flyers/${USER}/${FILE}.webp`, BASE)).not.toBeNull();
  });

  it('accepts a base URL that carries a path prefix', () => {
    const base = 'https://pub-abc.r2.dev/media';
    const url = `${base}/campaign_flyers/${USER}/${FILE}.png`;
    expect(acceptFlyerUrl(url, base)).toBe(url);
  });

  it('rejects another host, including look-alike subdomains', () => {
    expect(acceptFlyerUrl(`https://evil.example/campaign_flyers/${USER}/${FILE}.png`, BASE)).toBeNull();
    expect(
      acceptFlyerUrl(`https://cdn.orkora.events.evil.example/campaign_flyers/${USER}/${FILE}.png`, BASE),
    ).toBeNull();
  });

  it('rejects plain http and embedded credentials', () => {
    expect(acceptFlyerUrl(good.replace('https:', 'http:'), BASE)).toBeNull();
    expect(acceptFlyerUrl(`https://user:pw@cdn.orkora.events/campaign_flyers/${USER}/${FILE}.png`, BASE)).toBeNull();
  });

  it('rejects other upload folders and path tricks', () => {
    expect(acceptFlyerUrl(`${BASE}/banners/${USER}/${FILE}.png`, BASE)).toBeNull();
    // Climbing out of campaign_flyers/ resolves to /banners/... and is refused.
    expect(acceptFlyerUrl(`${BASE}/campaign_flyers/${USER}/../../banners/${FILE}.png`, BASE)).toBeNull();
    expect(acceptFlyerUrl(`${BASE}/campaign_flyers/${FILE}.png`, BASE)).toBeNull();
  });

  it('rejects non-image extensions, query strings and fragments', () => {
    expect(acceptFlyerUrl(`${BASE}/campaign_flyers/${USER}/${FILE}.gif`, BASE)).toBeNull();
    expect(acceptFlyerUrl(`${BASE}/campaign_flyers/${USER}/${FILE}.html`, BASE)).toBeNull();
    expect(acceptFlyerUrl(`${good}?track=1`, BASE)).toBeNull();
    expect(acceptFlyerUrl(`${good}#x`, BASE)).toBeNull();
  });

  it('rejects everything when no media base is configured, and empty input', () => {
    expect(acceptFlyerUrl(good, undefined)).toBeNull();
    expect(acceptFlyerUrl(good, '')).toBeNull();
    expect(acceptFlyerUrl('', BASE)).toBeNull();
    expect(acceptFlyerUrl(null, BASE)).toBeNull();
    expect(acceptFlyerUrl('not a url', BASE)).toBeNull();
  });
});

describe('renderFlyerBlock', () => {
  it('renders the image and a Download flyer link to the same URL', () => {
    const url = 'https://cdn.orkora.events/campaign_flyers/u/f.png';
    const html = renderFlyerBlock(url);
    expect(html).toContain(`<img src="${url}"`);
    expect(html).toContain(`<a href="${url}"`);
    expect(html).toContain('Download flyer');
    expect(html).toContain('alt="Event flyer"');
  });

  it('escapes attribute-breaking characters', () => {
    const html = renderFlyerBlock('https://x/a"onerror="b');
    expect(html).not.toContain('"onerror="');
    expect(html).toContain('&quot;onerror=&quot;');
  });
});
