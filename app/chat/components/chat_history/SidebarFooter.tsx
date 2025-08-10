'use client';

import React from 'react';
import { Settings, User, LogOut, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/ui/toggleButton';
import SignOut from '@/components/layout/SignOut';
import { SmartAvatar } from '@/components/ui/Avatar';

interface SidebarFooterProps {
  userInfo: {
    id: string;
    full_name: string;
    email: string;
  };
}

export default function ChatSidebarFooter({ userInfo }: SidebarFooterProps) {
  if (!userInfo) {
    return null; // Don't show footer if user is not signed in
  }

  return (
    <div className="border-t border-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 px-3"
          >
            <SmartAvatar 
              user={userInfo} 
              size={32}
              style="miniavs"
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
                style="miniavs"
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
          
          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4" />
            <SignOut />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}