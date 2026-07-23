import { ImageResponse } from 'next/og';

/**
 * Server-generated shareable card for a ticket, in three social formats.
 *
 *   /og/ticket/<code>?format=og      1200x630  (link unfurl: WhatsApp/X/iMessage)
 *   /og/ticket/<code>?format=story   1080x1920 (Instagram / WhatsApp story)
 *   /og/ticket/<code>?format=square  1080x1080 (Instagram feed)
 *
 * The card is brand-styled from the event's organization (brand colour) and is
 * built only from the safe share payload (no QR token, no check-in data). If
 * the payload cannot be fetched we still render a generic Orkora card so a
 * shared link never unfurls broken.
 */

export const runtime = 'edge';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';

type Format = 'og' | 'story' | 'square';

const SIZES: Record<Format, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

interface Share {
  attendeeFirstName: string;
  event: {
    title: string;
    code: string;
    startAt: string;
    timezone: string;
  };
  brand: { name: string; brandColor: string | null };
}

function hostFromApp(): string {
  try {
    return new URL(APP).host;
  } catch {
    return 'orkora.events';
  }
}

function formatDate(iso: string, tz: string): string {
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

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const url = new URL(req.url);
  const fmtParam = (url.searchParams.get('format') ?? 'og') as Format;
  const format: Format = fmtParam in SIZES ? fmtParam : 'og';
  const { width, height } = SIZES[format];

  let share: Share | null = null;
  try {
    const res = await fetch(`${API}/v1/tickets/${params.code}/share`, {
      // Cache at the edge for a short window; the card content is stable.
      next: { revalidate: 300 },
    });
    if (res.ok) share = (await res.json()) as Share;
  } catch {
    share = null;
  }

  const brandColor = share?.brand.brandColor || '#6C5CE7';
  const brandName = share?.brand.name || 'Orkora';
  const title = share?.event.title || 'An event on Orkora';
  const dateLine = share ? formatDate(share.event.startAt, share.event.timezone) : '';
  const firstName = share?.attendeeFirstName || '';
  const eventUrl = share ? `${hostFromApp()}/e/${share.event.code}` : hostFromApp();

  const isTall = format === 'story';
  const pad = isTall ? 96 : 64;
  const titleSize = format === 'story' ? 104 : format === 'square' ? 84 : 76;
  const eyebrowSize = isTall ? 34 : 26;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: pad,
          color: '#ffffff',
          backgroundColor: '#0B0B14',
          backgroundImage: `linear-gradient(135deg, ${brandColor} 0%, rgba(11,11,20,0.65) 55%, #0B0B14 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top: brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: eyebrowSize,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            opacity: 0.95,
          }}
        >
          {brandName}
        </div>

        {/* Middle: the going statement */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isTall ? 28 : 16 }}>
          <div
            style={{
              fontSize: eyebrowSize,
              letterSpacing: 6,
              textTransform: 'uppercase',
              opacity: 0.8,
            }}
          >
            I am going to
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {dateLine ? (
            <div style={{ fontSize: eyebrowSize + 4, opacity: 0.9 }}>{dateLine}</div>
          ) : null}
        </div>

        {/* Bottom: attendee + wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {firstName ? (
              <div style={{ fontSize: eyebrowSize + 6, fontWeight: 700 }}>{firstName}</div>
            ) : null}
            <div style={{ fontSize: eyebrowSize - 4, letterSpacing: 4, opacity: 0.75 }}>
              SEE YOU THERE
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: eyebrowSize - 2, fontWeight: 700, opacity: 0.95 }}>Orkora</div>
            <div style={{ fontSize: eyebrowSize - 8, opacity: 0.7 }}>{eventUrl}</div>
          </div>
        </div>
      </div>
    ),
    { width, height },
  );
}
