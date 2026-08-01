// Public discovery data helpers. These back the SEO browse pages
// (/c/[category] and /city/[city]) and the sitemap. They read the API's
// unauthenticated discover endpoints. No consumer "Discover hub" is built on
// top of these; they exist so category/city landing pages are crawlable.

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface DiscoverEvent {
  code: string;
  slug: string;
  title: string;
  kind: string;
  startAt: string;
  endAt: string;
  timezone: string;
  bannerUrl: string | null;
  category: string | null;
  city: string | null;
  organization: { name: string; slug: string; brandColor: string | null };
}

export interface DiscoverBrowse {
  total: number;
  take: number;
  skip: number;
  events: DiscoverEvent[];
}

export interface DiscoverFacets {
  categories: { slug: string; count: number }[];
  cities: { city: string; count: number }[];
}

export async function browseEvents(opts: {
  category?: string;
  city?: string;
  take?: number;
  skip?: number;
}): Promise<DiscoverBrowse> {
  const qs = new URLSearchParams();
  if (opts.category) qs.set('category', opts.category);
  if (opts.city) qs.set('city', opts.city);
  if (opts.take != null) qs.set('take', String(opts.take));
  if (opts.skip != null) qs.set('skip', String(opts.skip));
  try {
    const res = await fetch(`${API}/v1/events/discover/browse?${qs.toString()}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { total: 0, take: opts.take ?? 24, skip: opts.skip ?? 0, events: [] };
    return (await res.json()) as DiscoverBrowse;
  } catch {
    return { total: 0, take: opts.take ?? 24, skip: opts.skip ?? 0, events: [] };
  }
}

export async function discoverFacets(): Promise<DiscoverFacets> {
  try {
    // 300s so a newly-tagged city resolves on its /city/[slug] page within a
    // few minutes rather than up to an hour (the city page resolves its slug
    // through these facets).
    const res = await fetch(`${API}/v1/events/discover/facets`, { next: { revalidate: 300 } });
    if (!res.ok) return { categories: [], cities: [] };
    return (await res.json()) as DiscoverFacets;
  } catch {
    return { categories: [], cities: [] };
  }
}

// City slug helpers: URLs use a lowercase, hyphenated slug; the stored city is
// free text, so we round-trip through a normalized form for lookups.
export function citySlug(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
