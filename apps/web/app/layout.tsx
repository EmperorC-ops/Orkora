import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { ToastProvider } from '@/components/toast';
import RegisterServiceWorker from './_components/RegisterServiceWorker';
import StagingBanner from './_components/StagingBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

// Every route must render dynamically: the CSP uses a per-request nonce with
// 'strict-dynamic' (see middleware.ts), and Next can only stamp the nonce
// onto its <script> tags during a per-request render. Statically prerendered
// pages ship nonce-less script tags that the CSP then blocks, which kills
// hydration platform-wide (broken login was the first symptom). If a static
// marketing tier is wanted later, split the CSP so only static routes drop
// the nonce (e.g. hash-based or 'self'-only policy on those paths).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Orkora',
    template: '%s | Orkora',
  },
  description:
    'Orchestrate every moment. Registration, paid checkout, attendee tickets, and live chat for events.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  applicationName: 'Orkora',
  // PWA manifest. Browsers that support installable web apps read this and
  // surface an "Install Orkora" prompt. iOS Safari uses the apple-* fields
  // below in addition to the manifest.
  manifest: '/manifest.webmanifest',
  // The brand mark is a vector SVG at /brand/orkora-mark.svg; browsers
  // that support SVG favicons render it at any size (Firefox, Chrome,
  // Safari 17+). The PNG ladder under /icons/ is the fallback path for
  // older browsers + iOS apple-touch-icon, regenerated from the SVG via
  // `pnpm brand:generate`.
  icons: {
    icon: [
      { url: '/brand/orkora-mark.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/brand/orkora-mark.svg',
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Orkora',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'Orkora',
    description:
      'Registration, paid checkout, attendee tickets, and live chat for events. Built for organizers who sell tickets in dollars, naira, cedi, and shillings.',
    type: 'website',
    siteName: 'Orkora',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Orkora - Professional Event Platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orkora',
    description: 'Registration, paid checkout, attendee tickets, and live chat for events.',
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  // Brand purple so Android's status bar and the iOS PWA chrome (when the
  // app is installed) blend into the brand surface.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4C1D95' },
    { media: '(prefers-color-scheme: dark)', color: '#4C1D95' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Keep zoom available for accessibility (WCAG 2.1 SC 1.4.4). Some PWA
  // templates disable it to feel "native"; the accessibility cost outweighs
  // the visual nicety.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-surface-deep font-sans text-ink-primary">
        <StagingBanner />
        <RegisterServiceWorker />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
