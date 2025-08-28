import React, { type ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter, Jomolhari } from 'next/font/google';
import { getSession } from '@/lib/server/supabase';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { Toaster as ToastToaster } from '@/components/ui/toaster';
import { MobileSidebarProvider } from '@/app/chat/components/chat_history/ChatHistorySidebar';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: false,
  variable: '--font-Inter'
});

const jomolhari = Jomolhari({
  subsets: ['latin'],
  weight: '400',
  display: 'swap'
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://www.patioai.chat/'),
  title: {
    default: 'PatioAI',
    template: '%s | PatioAI'
  },
  description: 'Experience the power of AI-driven conversations with PatioAI. Ask questions on any topic and get informative responses instantly.',
  keywords: ['AI', 'Chat', 'Assistant', 'Artificial Intelligence', 'Conversation'],
  authors: [{ name: 'PatioAI' }],
  creator: 'PatioAI',
  publisher: 'PatioAI',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover', // For devices with notches
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
    shortcut: [
      { url: '/favicon.ico', type: 'image/x-icon' }
    ]
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://www.patioai.chat/',
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
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className={`${jomolhari.className} min-h-screen w-full overflow-x-hidden`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <MobileSidebarProvider>
            <main className="w-full min-w-0">{children}</main>
            <Toaster />
            <ToastToaster />
          </MobileSidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
