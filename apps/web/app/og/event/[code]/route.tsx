import { ImageResponse } from 'next/og';
import {
  Card,
  SIZES,
  normalizeFormat,
  hostFromApp,
  formatDate,
} from '../../_card';

/**
 * Branded Open Graph card for an event, so a shared event link unfurls with a
 * designed card instead of a raw banner. Public and safe (event code only).
 * Powers the event page's og:image and the "Share event" link.
 */

export const runtime = 'edge';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';

interface PublicEvent {
  title: string;
  code: string;
  startAt: string;
  timezone: string;
  organization: { name: string; brandColor: string | null };
}

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const format = normalizeFormat(new URL(req.url).searchParams.get('format'));
  const { width, height } = SIZES[format];

  let event: PublicEvent | null = null;
  try {
    const res = await fetch(
      `${API}/v1/events/by-code/${encodeURIComponent(params.code)}`,
      { next: { revalidate: 300 } },
    );
    if (res.ok) event = (await res.json()) as PublicEvent;
  } catch {
    event = null;
  }

  return new ImageResponse(
    (
      <Card
        format={format}
        brandColor={event?.organization.brandColor || '#6C5CE7'}
        brandName={event?.organization.name || 'Orkora'}
        eyebrow="You are invited to"
        title={event?.title || 'An event on Orkora'}
        dateLine={event ? formatDate(event.startAt, event.timezone) : ''}
        eventUrl={event ? `${hostFromApp(APP)}/e/${event.code}` : hostFromApp(APP)}
      />
    ),
    { width, height },
  );
}
