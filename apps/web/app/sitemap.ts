import type { MetadataRoute } from 'next';
import { discoverFacets, citySlug } from '@/lib/discover';

/**
 * Public sitemap: the landing page, every Brand Home (+ its past archive), and
 * every published event. Sourced from the API so it reflects live data, cached
 * for an hour. Ticket pages are intentionally excluded (they are noindex).
 */

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const revalidate = 3600;

interface SitemapSource {
  orgs: { slug: string; updatedAt: string }[];
  events: { code: string; updatedAt: string }[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: APP, changeFrequency: 'daily', priority: 1 },
  ];

  try {
    const res = await fetch(`${API}/v1/public/orgs/sitemap`, { next: { revalidate: 3600 } });
    if (!res.ok) return entries;
    const data = (await res.json()) as SitemapSource;

    for (const o of data.orgs ?? []) {
      entries.push({
        url: `${APP}/o/${o.slug}`,
        lastModified: o.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
      entries.push({
        url: `${APP}/o/${o.slug}/past`,
        lastModified: o.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.4,
      });
    }

    for (const e of data.events ?? []) {
      entries.push({
        url: `${APP}/e/${e.code}`,
        lastModified: e.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  } catch {
    // On any failure, ship at least the landing page rather than a 500.
  }

  // Discovery browse pages: only categories/cities that currently have events.
  try {
    const facets = await discoverFacets();
    for (const c of facets.categories ?? []) {
      entries.push({
        url: `${APP}/c/${c.slug}`,
        changeFrequency: 'daily',
        priority: 0.5,
      });
    }
    for (const c of facets.cities ?? []) {
      entries.push({
        url: `${APP}/city/${citySlug(c.city)}`,
        changeFrequency: 'daily',
        priority: 0.5,
      });
    }
  } catch {
    // Discovery pages are optional in the sitemap; skip on failure.
  }

  return entries;
}
