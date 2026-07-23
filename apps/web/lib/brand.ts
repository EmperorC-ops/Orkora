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
  upcoming: BrandEvent[];
  past: BrandEvent[];
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
