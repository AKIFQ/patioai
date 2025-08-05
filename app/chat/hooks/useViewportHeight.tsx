'use client';

import { useState, useEffect } from 'react';

export function useViewportHeight() {
  const [height, setHeight] = useState(600); // Default fallback

  useEffect(() => {
    const updateHeight = () => {
      setHeight(window.innerHeight);
    };

    // Set initial height
    updateHeight();

    // Listen for resize events
    window.addEventListener('resize', updateHeight);

    return () => {
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  return height;
}