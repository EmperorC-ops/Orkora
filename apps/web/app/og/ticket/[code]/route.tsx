import { ImageResponse } from 'next/og';
import {
  Card,
  SIZES,
  normalizeFormat,
  hostFromApp,
  formatDate,
} from '../../_card';

/**
 * Server-generated shareable card for a ticket, in three social formats:
 *
 *   /og/ticket/<code>?format=og      1200x630  (link unfurl)
 *   /og/ticket/<code>?format=story   1080x1920 (Instagram / WhatsApp story)
 *   /og/ticket/<code>?format=square  1080x1080 (Instagram feed)
 *
 * Built only from the safe share payload (no QR token, no check-in data). Falls
 * back to a generic Orkora card if the payload cannot be fetched, so a shared
 * link never unfurls broken.
 */

export const runtime = 'edge';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';

interface Share {
  attendeeFirstName: string;
  event: { title: string; code: string; startAt: string; timezone: string };
  brand: { name: string; brandColor: string | null };
}

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const format = normalizeFormat(new URL(req.url).searchParams.get('format'));
  const { width, height } = SIZES[format];

  let share: Share | null = null;
  try {
    const res = await fetch(`${API}/v1/tickets/${params.code}/share`, {
      next: { revalidate: 300 },
    });
    if (res.ok) share = (await res.json()) as Share;
  } catch {
    share = null;
  }

  return new ImageResponse(
    (
      <Card
        format={format}
        brandColor={share?.brand.brandColor || '#6C5CE7'}
        brandName={share?.brand.name || 'Orkora'}
        eyebrow="I am going to"
        title={share?.event.title || 'An event on Orkora'}
        dateLine={share ? formatDate(share.event.startAt, share.event.timezone) : ''}
        footerName={share?.attendeeFirstName || undefined}
        eventUrl={share ? `${hostFromApp(APP)}/e/${share.event.code}` : hostFromApp(APP)}
      />
    ),
    { width, height },
  );
}
