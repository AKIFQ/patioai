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
import SignOut from '@/app/components/ui/Navbar/SignOut';

interface SidebarFooterProps {
  userInfo: {
    id: string;
    full_name: string;
    email: string;
  };
}

export default function ChatSidebarFooter({ userInfo }: SidebarFooterProps) {
  if (!userInfo.email) {
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
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
              {userInfo.full_name?.charAt(0)?.toUpperCase() || 
               userInfo.email?.charAt(0)?.toUpperCase() || 
               'U'}
            </div>
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
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                {userInfo.full_name?.charAt(0)?.toUpperCase() || 
                 userInfo.email?.charAt(0)?.toUpperCase() || 
                 'U'}
              </div>
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