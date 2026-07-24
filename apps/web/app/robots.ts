import type { MetadataRoute } from 'next';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';

/**
 * Crawl rules. Public marketing, Brand Homes, and event pages are indexable;
 * the organiser dashboard, admin, auth, API, OG image routes, and ticket pages
 * are kept out of the index. Ticket pages are additionally noindex via the /t
 * layout, but disallowing them here keeps crawlers off entirely.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/t/', '/api/', '/og/', '/login', '/signup', '/me/'],
    },
    sitemap: `${APP}/sitemap.xml`,
    host: APP,
  };
}
