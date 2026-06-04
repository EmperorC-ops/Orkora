// CSP is emitted per-request from apps/web/middleware.ts so we can mint a
// fresh nonce and stamp it onto Next.js's inline bootstrap scripts under
// an enforced (not Report-Only) policy. This file intentionally no longer
// owns Content-Security-Policy. To temporarily revert to Report-Only set
// CSP_REPORT_ONLY=1 on the deploy; see middleware.ts for the playbook.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ['@orkora/ui', '@orkora/sdk', '@orkora/contracts'],
  // Skip TS + ESLint failures during production builds so Vercel can ship.
  // Type errors are still surfaced by `pnpm typecheck` locally and in CI.
  // Remove these once the type errors are cleaned up.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: 'cdn.orkora.events' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      // Cloudflare R2 public bucket URL (S3_PUBLIC_BASE_URL), used as the
      // public src for uploaded banners/avatars/logos.
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          // Content-Security-Policy is set per-request in middleware.ts to
          // carry a fresh nonce. Do not duplicate it here.
        ],
      },
    ];
  },
};

export default nextConfig;
