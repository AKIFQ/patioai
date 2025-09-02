'use client';

import React, { useState, useEffect } from 'react';
import { X, Monitor } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname } from 'next/navigation';

interface MobileNotificationProps {
  message: string;
  storageKey: string;
  className?: string;
}

export function MobileNotification({ 
  message, 
  storageKey, 
  className = '' 
}: MobileNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isMobile = useIsMobile();
  const pathname = usePathname();

  useEffect(() => {
    // Only show on mobile devices
    if (!isMobile) return;

    // Only show on /chat routes (including /chat/*, /chat/room/*, etc.)
    if (!pathname.startsWith('/chat')) return;

    // Check if user has already dismissed this notification
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // Show notification after a brief delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isMobile, storageKey, pathname]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem(storageKey, 'true');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setCurrentX(0);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touchX = e.touches[0].clientX;
    const diffX = touchX - startX;
    setCurrentX(diffX);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    // If swiped more than 100px in either direction, dismiss
    if (Math.abs(currentX) > 100) {
      handleDismiss();
    } else {
      // Reset position
      setCurrentX(0);
    }
  };

  // Don't render if not mobile, dismissed, or not visible
  if (!isMobile || isDismissed || !isVisible) {
    return null;
  }

  const translateX = isDragging ? currentX : 0;
  const opacity = isDragging ? Math.max(0.3, 1 - Math.abs(currentX) / 200) : 1;

  return (
    <div
      className={`fixed top-4 left-4 right-4 z-50 transform transition-all duration-500 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0'
      } ${className}`}
      style={{
        transform: `translateX(${translateX}px) translateY(${isVisible ? '0' : '-64px'})`,
        opacity: isDragging ? opacity : (isVisible ? 1 : 0)
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="bg-amber-50 dark:bg-amber-950/90 border border-amber-300 dark:border-amber-700/60 rounded-xl shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3 p-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800 dark:to-amber-700 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Monitor className="h-4 w-4 text-amber-800 dark:text-amber-200" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100 leading-relaxed">
              {message}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              Swipe to dismiss
            </p>
          </div>
          
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-800 hover:bg-amber-200 dark:hover:bg-amber-700 flex items-center justify-center flex-shrink-0 transition-all duration-200 touch-manipulation group"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300 group-hover:text-amber-800 dark:group-hover:text-amber-200" />
          </button>
        </div>
        
        {/* Subtle bottom accent */}
        <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-600 rounded-b-xl opacity-90" />
      </div>
    </div>
  );
}