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
        width={100}
        height={50}
        priority
        // className="h-12 w-auto"
      />
    </div>
  );
}
