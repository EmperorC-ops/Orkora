import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { ToastProvider } from '@/components/toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: 'Orkora',
    template: '%s | Orkora',
  },
  description: 'Control your event from one system. Registration, ticketing, check-in, engagement, and analytics built for African and global organizers.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-surface-deep font-sans text-ink-primary">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
