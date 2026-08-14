// src/app/layout.tsx
import './globals.css';
import { WebRTCProvider } from '@/context/WebRTCContext';

export const metadata = {
  title: 'War Game',
  description: 'Multiplayer Tank Game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <WebRTCProvider>{children}</WebRTCProvider>
      </body>
    </html>
  );
}