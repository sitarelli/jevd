import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Diario clinico · Estrazione parametri con Jev',
  description: 'Demo: estrazione di parametri tipizzati dal diario infermieristico con TypeSafe Jev via Vercel AI Gateway',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1e3a8a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans text-slate-800">{children}</body>
    </html>
  );
}
