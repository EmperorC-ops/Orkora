const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface BrandEvent {
  title: string;
  code: string;
  slug: string;
  kind: 'physical' | 'virtual' | 'hybrid' | string;
  startAt: string;
  endAt: string;
  timezone: string;
  bannerUrl: string | null;
  status: string;
}

export interface Brand {
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string | null;
  tagline: string | null;
  heroVariant: 'default' | 'cinematic' | 'editorial' | string;
  heroMediaUrl: string | null;
  heroMediaType: 'image' | 'video' | string | null;
  heroBio: string | null;
  upcoming: BrandEvent[];
  past: BrandEvent[];
}

/**
 * Fire-and-forget brand engagement event (Brand Home view, Shareable Card
 * generate/view/download). Best-effort: uses sendBeacon so it survives an
 * imminent navigation, and never throws.
 */
export function recordBrandEvent(
  slug: string,
  kind:
    | 'brand_home.viewed'
    | 'shareable_card.generated'
    | 'shareable_card.viewed'
    | 'shareable_card.downloaded',
  source?: string | null,
): void {
  if (!slug) return;
  try {
    const url = `${API}/v1/public/orgs/${encodeURIComponent(slug)}/analytics`;
    const body = JSON.stringify({ kind, source: source ?? undefined });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // best-effort; analytics must never break the page
  }
}

/**
 * Fire-and-forget Shareable Card event keyed by ticket code (the API resolves
 * the owning brand). Used on the ticket page where the org slug is not loaded.
 */
export function recordTicketCardEvent(
  code: string,
  kind: 'shareable_card.generated' | 'shareable_card.downloaded',
  source?: string | null,
): void {
  if (!code) return;
  try {
    const url = `${API}/v1/tickets/${encodeURIComponent(code)}/card-analytics`;
    const body = JSON.stringify({ kind, source: source ?? undefined });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // best-effort
  }
}

/** Community subscribe from the public Brand Home. Idempotent server-side. */
export async function subscribeToBrand(
  slug: string,
  email: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API}/v1/public/orgs/${encodeURIComponent(slug)}/subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Public Brand Home payload. Server-side fetch (used by the /o/[slug] page and
 * its metadata). Returns null on any failure so callers can render notFound().
 */
export async function getBrand(slug: string): Promise<Brand | null> {
  try {
    const res = await fetch(`${API}/v1/public/orgs/${encodeURIComponent(slug)}`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Brand;
  } catch {
    return null;
  }
}
