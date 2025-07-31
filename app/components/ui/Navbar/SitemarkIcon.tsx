'use client';
import React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';

export default function SitemarkIcon() {
  const { theme, systemTheme } = useTheme();
  
  // Determine which theme is actually active
  const currentTheme = theme === 'system' ? systemTheme : theme;
  
  return (
    <div className="flex items-center">
      <Image
        src="/logos/logo-horizontal.png"
        alt="PatioAI"
        width={120}
        height={32}
        priority
        className="h-8 w-auto"
      />
    </div>
  );
}
