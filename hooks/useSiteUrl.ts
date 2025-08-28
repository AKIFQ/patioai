import { useMemo } from 'react';

export function useSiteUrl(): string {
  return useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    
    // Fallback for SSR
    return process.env.NEXT_PUBLIC_SITE_URL || 
           process.env.NEXT_PUBLIC_APP_URL || 
           'https://www.patioai.chat';
  }, []);
} 