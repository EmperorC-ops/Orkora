/**
 * Shared shareable-card renderer for the OG image routes (ticket + event).
 * Satori-compatible: every element that has children uses display:flex, and
 * only inline styles are used. Typography leans on size, letter-spacing, and
 * opacity for hierarchy so it looks designed with the default font (no bundled
 * font dependency, which keeps card generation fast and never fails to load).
 */

export type Format = 'og' | 'story' | 'square';

export const SIZES: Record<Format, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export function normalizeFormat(v: string | null): Format {
  return v === 'story' || v === 'square' ? v : 'og';
}

export function hostFromApp(app: string): string {
  try {
    return new URL(app).host;
  } catch {
    return 'orkora.events';
  }
}

export function formatDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz || 'UTC',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export interface CardProps {
  format: Format;
  brandColor: string;
  brandName: string;
  eyebrow: string;
  title: string;
  dateLine: string;
  footerName?: string;
  eventUrl: string;
  /** Optional hero image (the event banner). When set, it fills the card as
   *  the background with a dark scrim over it so the branded text stays legible. */
  imageUrl?: string | null;
}

export function Card({
  format,
  brandColor,
  brandName,
  eyebrow,
  title,
  dateLine,
  footerName,
  eventUrl,
  imageUrl,
}: CardProps) {
  const isTall = format === 'story';
  const pad = isTall ? 96 : 64;
  const titleSize = format === 'story' ? 108 : format === 'square' ? 86 : 74;
  const base = isTall ? 34 : 26;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: pad,
        color: '#ffffff',
        backgroundColor: '#0B0B14',
        // Keep the brand radial when there is no banner; the banner supplies the
        // backdrop when present, so the radial would only muddy it.
        backgroundImage: imageUrl
          ? undefined
          : `radial-gradient(120% 120% at 0% 0%, ${brandColor} 0%, rgba(11,11,20,0.2) 42%, rgba(11,11,20,0.95) 78%)`,
        fontFamily: 'sans-serif',
      }}
    >
      {/* Banner backdrop + legibility scrim (only when a banner exists). */}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
          }}
        />
      ) : null}
      {imageUrl ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            zIndex: 0,
            backgroundImage:
              'linear-gradient(180deg, rgba(11,11,20,0.40) 0%, rgba(11,11,20,0.55) 45%, rgba(11,11,20,0.82) 100%)',
          }}
        />
      ) : null}

      {/* Top: brand */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            fontSize: base,
            letterSpacing: 3,
            textTransform: 'uppercase',
            opacity: 0.92,
          }}
        >
          {brandName}
        </div>
      </div>

      {/* Middle: the statement */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: isTall ? 30 : 18,
        }}
      >
        {/* accent bar */}
        <div
          style={{ display: 'flex', width: 88, height: 8, borderRadius: 4, backgroundColor: brandColor }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: base,
            letterSpacing: 7,
            textTransform: 'uppercase',
            opacity: 0.82,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            lineHeight: 1.02,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </div>
        {dateLine ? (
          <div style={{ display: 'flex', fontSize: base + 6, opacity: 0.9 }}>{dateLine}</div>
        ) : null}
      </div>

      {/* Bottom: attendee + wordmark */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {footerName ? (
            <div style={{ display: 'flex', fontSize: base + 8 }}>{footerName}</div>
          ) : null}
          <div style={{ display: 'flex', fontSize: base - 4, letterSpacing: 5, opacity: 0.7 }}>
            SEE YOU THERE
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', fontSize: base - 2, opacity: 0.95 }}>Orkora</div>
          <div style={{ display: 'flex', fontSize: base - 8, opacity: 0.65 }}>{eventUrl}</div>
        </div>
      </div>
    </div>
  );
}
