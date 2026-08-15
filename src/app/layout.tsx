// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { WebRTCProvider } from '@/context/WebRTCContext';

export const metadata: Metadata = {
  title: 'BOMB BATTLE 2D - Multiplayer Tank Game',
  description: 'Real-time 2D Multiplayer Tank & Bomb Battle Game',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full overscroll-none select-none">
        <WebRTCProvider>{children}</WebRTCProvider>
      </body>
    </html>
  );
}