'use client';

import React, { useState } from 'react';
import { Settings, User, LogOut, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ModeToggle } from '@/components/ui/toggleButton';
import SignOut from '@/components/layout/SignOut';
import { SmartAvatar } from '@/components/ui/Avatar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRoomAuth } from '@/lib/auth/roomAuth';

interface SidebarFooterProps {
  userInfo: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export default function ChatSidebarFooter({ userInfo }: SidebarFooterProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const { signInToRoom } = useRoomAuth();

  // Show user info for both authenticated and anonymous users
  if (!userInfo || !userInfo.id) {
    // For anonymous users, show their display name without sign-in button
    const displayName = userInfo?.full_name || 'Anonymous User';
    return (
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground">
              Anonymous
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Shared trigger button
  const TriggerButton = (
    <Button
      variant="ghost"
      className="w-full justify-start gap-3 h-12 px-3 touch-manipulation"
      style={{ minHeight: '48px' }} // iOS touch target minimum
    >
      <SmartAvatar 
        user={userInfo} 
        size={32}
        style="thumbs"
      />
      <div className="flex flex-col items-start flex-1 min-w-0">
        <span className="text-sm font-medium truncate w-full">
          {userInfo.full_name || 'User'}
        </span>
        <span className="text-xs text-muted-foreground truncate w-full">
          {userInfo.email}
        </span>
      </div>
      <Settings className="h-4 w-4 text-muted-foreground" />
    </Button>
  );

  // Shared content
  const SettingsContent = (
    <>
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <SmartAvatar 
            user={userInfo} 
            size={40}
            style="thumbs"
          />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-base font-medium truncate">
              {userInfo.full_name || 'User'}
            </span>
            <span className="text-sm text-muted-foreground truncate">
              {userInfo.email}
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-2 space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-12 px-3 touch-manipulation"
          style={{ minHeight: '44px' }}
        >
          <span className="text-sm">Profile Settings</span>
        </Button>
        
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5" />
            <span className="text-sm">Theme</span>
          </div>
          <ModeToggle />
        </div>
        
        <div className="border-t border-border my-2" />
        
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-12 px-3 text-destructive hover:text-destructive hover:bg-destructive/10 touch-manipulation"
          style={{ minHeight: '44px' }}
          onClick={() => setIsOpen(false)}
        >
          <SignOut />
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="border-t border-border p-3">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            {TriggerButton}
          </SheetTrigger>
          <SheetContent 
            side="bottom" 
            className="h-auto max-h-[60vh] p-0 rounded-t-xl"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y'
            }}
          >
            {/* Drag handle */}
            <div className="w-16 h-2 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-2" />
            {SettingsContent}
            <div className="pb-safe" />
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {TriggerButton}
        </DropdownMenuTrigger>
        
        <DropdownMenuContent 
          align="end" 
          side="top"
          className="w-64 mb-2"
        >
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2">
              <SmartAvatar 
                user={userInfo} 
                size={32}
                style="thumbs"
              />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">
                  {userInfo.full_name || 'User'}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {userInfo.email}
                </span>
              </div>
            </div>
          </div>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem className="gap-2">
            Profile Settings
          </DropdownMenuItem>
          
          <DropdownMenuItem className="gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Theme
            </div>
            <ModeToggle />
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
            <SignOut />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}