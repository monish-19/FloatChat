import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FloatChat',
  description: 'Multi-modal semantic query engine for ARGO data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
