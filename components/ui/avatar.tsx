'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  /** User identifier (email, username, or any unique string) */
  seed: string;
  /** Size of the avatar */
  size?: number;
  /** Avatar style - choose the aesthetic that fits your app */
  style?: 'thumbs' | 'miniavs' | 'lorelei' | 'personas' | 'micah' | 'adventurer' | 'shapes' | 'initials';
  /** Custom className */
  className?: string;
  /** Alt text for accessibility */
  alt?: string;
}

/**
 * Beautiful, consistent avatars using Dicebear
 * Perfect for users without profile pictures
 */
export function Avatar({ 
  seed, 
  size = 40, 
  style = 'thumbs', // Default to thumbs for ultra-minimalist look
  className,
  alt = 'User avatar'
}: AvatarProps) {
  // Sanitize the seed to ensure consistent results
  const sanitizedSeed = encodeURIComponent(seed.toLowerCase().trim());
  
  // Build the Dicebear URL
  const avatarUrl = `https://api.dicebear.com/9.x/${style}/svg?seed=${sanitizedSeed}&size=${size}`;

  return (
    <div 
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full bg-muted/50",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={avatarUrl}
        alt={alt}
        width={size}
        height={size}
        className="w-full h-full"
        loading="lazy"
        style={{ objectFit: 'contain' }}
      />
    </div>
  );
}

/**
 * Fallback avatar using initials
 */
export function InitialsAvatar({ 
  name, 
  size = 40, 
  className,
  alt = 'User avatar'
}: {
  name: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const initials = name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Generate a consistent color based on the name
  const colors = [
    'bg-blue-500',
    'bg-green-500', 
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-teal-500'
  ];
  
  const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  const bgColor = colors[colorIndex];

  return (
    <div 
      className={cn(
        "relative inline-flex items-center justify-center rounded-full text-white font-medium",
        bgColor,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      <span className="select-none">{initials}</span>
    </div>
  );
}

/**
 * Smart avatar that automatically chooses the best option
 */
export function SmartAvatar({
  user,
  size = 40,
  className,
  style = 'thumbs' // Default to thumbs for all users
}: {
  user: {
    email?: string;
    full_name?: string;
    id?: string;
  };
  size?: number;
  className?: string;
  style?: AvatarProps['style'];
}) {
  // Use email as primary seed, fallback to id, then name
  const seed = user.email || user.id || user.full_name || 'anonymous';
  const displayName = user.full_name || user.email?.split('@')[0] || 'User';

  return (
    <Avatar
      seed={seed}
      size={size}
      style={style}
      className={className}
      alt={`${displayName}'s avatar`}
    />
  );
}
