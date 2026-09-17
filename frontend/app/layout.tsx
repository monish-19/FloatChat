import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FloatChat — Ocean Intelligence',
  description: 'Deep-ocean data intelligence: semantic search across ARGO float profiles with real-time 3D trajectory visualization, anomaly detection, and transect analysis.',
  keywords: ['ARGO floats', 'ocean data', 'BGC-Argo', 'oceanography', 'semantic search'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
