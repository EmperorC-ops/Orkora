import { ImageResponse } from 'next/og';
import { Card, SIZES, normalizeFormat, hostFromApp } from '../../_card';

/**
 * Branded OG card for a Brand Home, so a shared /o/<slug> link unfurls with a
 * designed card. Public and safe.
 */

export const runtime = 'edge';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';

interface Brand {
  name: string;
  slug: string;
  brandColor: string | null;
  upcoming: { title: string }[];
}

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const format = normalizeFormat(new URL(req.url).searchParams.get('format'));
  const { width, height } = SIZES[format];

  let brand: Brand | null = null;
  try {
    const res = await fetch(
      `${API}/v1/public/orgs/${encodeURIComponent(params.slug)}`,
      { next: { revalidate: 300 } },
    );
    if (res.ok) brand = (await res.json()) as Brand;
  } catch {
    brand = null;
  }

  const next = brand?.upcoming?.[0]?.title;

  return new ImageResponse(
    (
      <Card
        format={format}
        brandColor={brand?.brandColor || '#6C5CE7'}
        brandName="Event brand"
        eyebrow="A world on Orkora"
        title={brand?.name || 'An event brand on Orkora'}
        dateLine={next ? `Next up: ${next}` : ''}
        eventUrl={brand ? `${hostFromApp(APP)}/o/${brand.slug}` : hostFromApp(APP)}
      />
    ),
    { width, height },
  );
}
