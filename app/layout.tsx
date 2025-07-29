import React, { type ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Footer from '@/app/components/ui/Footer/Footer';
import { getSession } from '@/lib/server/supabase';
import NavBar from '@/app/components/ui/Navbar/TopBar';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: false,
  variable: '--font-Inter'
});
export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000/'),
  title: {
    default: 'PatioAI',
    template: '%s | PatioAI'
  },
  description: 'Experience the power of AI-driven conversations with PatioAI. Ask questions on any topic and get informative responses instantly.',
  keywords: ['AI', 'Chat', 'Assistant', 'Artificial Intelligence', 'Conversation'],
  authors: [{ name: 'PatioAI' }],
  creator: 'PatioAI',
  publisher: 'PatioAI',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
    shortcut: [
      { url: '/icon.png', type: 'image/png' }
    ]
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'http://localhost:3000/',
    title: 'PatioAI',
    description: 'Experience the power of AI-driven conversations with PatioAI',
    siteName: 'PatioAI',
    images: [
      {
        url: '/logos/logo-horizontal.png',
        width: 1200,
        height: 630,
        alt: 'PatioAI Logo'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PatioAI - AI Chat Assistant',
    description: 'Experience the power of AI-driven conversations with PatioAI',
    images: ['/logos/logo-horizontal.png']
  }
};

export default function RootLayout({
  children,
  modal
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* We pass the promise here and resolve it with react.use in the child to prevent the async request from blocking the UI */}
          <NavBar session={getSession()} />
          <main>{children}</main>
          <Toaster />
          {modal}
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
