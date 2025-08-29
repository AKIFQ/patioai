'use client';

import React, { useState } from 'react';
import { Settings, User, LogOut, Palette, CreditCard, Sun, Moon, Monitor } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useTheme } from 'next-themes';
import { ModeToggle } from '@/components/ui/toggleButton';
import SignOut from '@/components/layout/SignOut';
import { SmartAvatar } from '@/components/ui/avatar';
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
  const { theme, setTheme } = useTheme();

  // Custom theme toggle component for mobile
  const MobileThemeToggle = () => (
    <div className="flex flex-col gap-3 w-full">
      <div className="grid grid-cols-3 gap-3 w-full">
        <Button
          variant={theme === 'light' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTheme('light')}
          className="h-12 flex flex-col gap-2 p-3 text-xs font-medium"
        >
          <Sun className="h-5 w-5" />
          <span>Light</span>
        </Button>
        <Button
          variant={theme === 'dark' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTheme('dark')}
          className="h-12 flex flex-col gap-2 p-3 text-xs font-medium"
        >
          <Moon className="h-5 w-5" />
          <span>Dark</span>
        </Button>
        <Button
          variant={theme === 'system' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTheme('system')}
          className="h-12 flex flex-col gap-2 p-3 text-xs font-medium"
        >
          <Monitor className="h-5 w-5" />
          <span>Auto</span>
        </Button>
      </div>
    </div>
  );

  // Show user info for both authenticated and anonymous users
  if (!userInfo?.id) {
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
          asChild
        >
          <Link href="/account">
            <CreditCard className="h-4 w-4" />
            <span className="text-sm">Account Settings</span>
          </Link>
        </Button>
        
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-12 px-3 touch-manipulation"
          style={{ minHeight: '44px' }}
        >
          <User className="h-4 w-4" />
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
        
        <div className="px-3">
          <SignOut />
        </div>
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
            className="h-auto max-h-[85vh] p-0 rounded-t-xl border-t-2"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y'
            }}
          >
            <VisuallyHidden>
              <SheetTitle>User Settings</SheetTitle>
            </VisuallyHidden>
            {/* Drag handle */}
            <div className="w-16 h-2 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-4" />
            
            {/* Header Section - Fixed */}
            <div className="px-6 py-6 border-b border-border/40 flex-shrink-0">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="relative">
                    <SmartAvatar 
                      user={userInfo} 
                      size={80}
                      style="thumbs"
                      className="ring-4 ring-blue-100 dark:ring-blue-900/30"
                    />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {userInfo.full_name || 'User'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {userInfo.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-6 space-y-6">
                {/* Quick Actions */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Quick Actions
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="h-20 flex flex-col gap-2 p-3 hover:bg-muted/50 transition-all duration-200"
                      asChild
                    >
                      <Link href="/account" onClick={() => setIsOpen(false)}>
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <CreditCard className="h-4 w-4 text-blue-600" />
                        </div>
                        <span className="text-xs font-medium">Account</span>
                      </Link>
                    </Button>
                    
                    <Button
                      variant="outline"
                      className="h-20 flex flex-col gap-2 p-3 hover:bg-muted/50 transition-all duration-200"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <User className="h-4 w-4 text-purple-600" />
                      </div>
                      <span className="text-xs font-medium">Profile</span>
                    </Button>
                  </div>
                </div>

                {/* Preferences */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Preferences
                  </h3>
                  <div className="bg-muted/30 rounded-xl p-4 border border-border/40">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <Palette className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Theme</p>
                          <p className="text-xs text-muted-foreground">Choose your preferred appearance</p>
                        </div>
                      </div>
                      <MobileThemeToggle />
                    </div>
                  </div>
                </div>

                {/* Sign Out Section */}
                <div className="space-y-3">
                  <SignOut />
                </div>
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="px-6 py-4 border-t border-border/40 flex-shrink-0">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  PatioAI v2.0 • Secure AI Chat
                </p>
              </div>
            </div>
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
          
          <DropdownMenuItem className="gap-2" asChild>
            <Link href="/account">
              <CreditCard className="h-4 w-4" />
              Account Settings
            </Link>
          </DropdownMenuItem>
          
          <DropdownMenuItem className="gap-2">
            <User className="h-4 w-4" />
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
          
          <div className="px-2 py-1">
            <SignOut />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}