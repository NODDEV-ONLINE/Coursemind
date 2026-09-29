import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { LOW_DATA_BOOT_SCRIPT } from '@/lib/preferences';
import './globals.css';

// Headings only, one weight (600 is the only heading weight in the comps). No
// preload: in low-data mode the face is never used, so it's never downloaded.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
  preload: false,
  variable: '--font-space-grotesk',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'CourseMind',
  description:
    'A tutor that only answers from your course materials, with a citation for every claim.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  // Same value as the --bg brand token (metadata can't read CSS variables).
  themeColor: '#090E19',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-low-data is set before first paint by the boot script below.
    <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOW_DATA_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
