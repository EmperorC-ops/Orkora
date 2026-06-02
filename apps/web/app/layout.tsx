import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { ToastProvider } from '@/components/toast';
import RegisterServiceWorker from './_components/RegisterServiceWorker';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

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
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/favicon.svg',
    apple: [{ url: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
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
    images: [{ url: '/icon.svg' }],
  },
  twitter: {
    card: 'summary',
    title: 'Orkora',
    description: 'Registration, paid checkout, attendee tickets, and live chat for events.',
    images: ['/icon.svg'],
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
        <RegisterServiceWorker />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
