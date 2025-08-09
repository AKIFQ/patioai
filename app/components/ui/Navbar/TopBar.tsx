'use client';

import React, { useState, useCallback, use } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, ChevronDown } from 'lucide-react';
import { type User } from '@supabase/supabase-js';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import Sitemark from './SitemarkIcon';
import SignOut from './SignOut';
import { ModeToggle } from '@/components/ui/toggleButton';

interface HeaderProps {
  session: Promise<User | null | undefined>;
}

const Header: React.FC<HeaderProps> = ({ session }) => {
  const userData = use(session);
  const isLoggedIn = !!userData;
  const [sheetOpen, setSheetOpen] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  const isActive = useCallback(
    (href: string) => {
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const navigationItems = [
    { href: '/chat', text: 'AI Chat' }
  ];

  return (
    <>
      {/* Desktop navigation */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border h-12 hidden md:flex shadow-sm w-full">
        <div className="flex items-center justify-between w-full h-full px-4 lg:px-8 max-w-7xl mx-auto">
          <div className="flex items-center">
            <Link href="/" passHref>
              <Sitemark />
            </Link>
          </div>

          <div className="flex items-center justify-center flex-1">
            {navigationItems.map((item) => (
              <Button
                key={item.href}
                variant={isActive(item.href) ? 'secondary' : 'ghost'}
                className={`font-semibold text-sm lg:text-base mx-1 rounded-md ${
                  isActive(item.href)
                    ? 'text-primary font-bold bg-primary/10'
                    : 'text-foreground hover:bg-muted'
                }`}
                asChild
                onMouseEnter={() => router.prefetch(item.href)}
              >
                <Link href={item.href} prefetch={false}>
                  {item.text}
                </Link>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="font-semibold text-sm lg:text-base mx-1 rounded-md"
                  >
                    Profile <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>
                    <SignOut />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant={isActive('/signin') ? 'secondary' : 'ghost'}
                className={`font-semibold text-sm lg:text-base mx-1 rounded-md ${
                  isActive('/signin')
                    ? 'text-primary font-bold bg-primary/10'
                    : 'text-foreground'
                }`}
                asChild
              >
                <Link href="/signin" prefetch={false}>
                  Sign in
                </Link>
              </Button>
            )}

            {/* Theme Toggle Button - Desktop */}
            <div className="ml-2">
              <ModeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile navigation */}
      {/* Mobile navigation is removed as per edit hint */}

      {/* Mobile Settings Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center p-4 border-b">
              <Link href="/" className="cursor-pointer">
                <div className="scale-75 origin-left">
                  <Sitemark />
                </div>
              </Link>
              {/* Theme Toggle Button - Mobile */}
              <ModeToggle />
            </div>

            <Separator />

            <nav className="flex-1 overflow-auto">
              <ul className="py-2 w-full">
                {navigationItems.map((item, index) => (
                  <React.Fragment key={item.href}>
                    <li>
                      <Link
                        href={item.href}
                        className={`flex py-3 px-4 font-semibold text-base ${
                          isActive(item.href)
                            ? 'bg-muted text-primary'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSheetOpen(false)}
                        prefetch={false}
                      >
                        {item.text}
                      </Link>
                    </li>
                    {index < navigationItems.length - 1 && <Separator />}
                  </React.Fragment>
                ))}

                {isLoggedIn && (
                  <>
                    <Separator />
                    <li className="py-3 px-4">
                      <SignOut />
                    </li>
                  </>
                )}

                {!isLoggedIn && (
                  <>
                    <Separator />
                    <li>
                      <Link
                        href="/signin"
                        className="flex py-3 px-4 font-semibold text-base hover:bg-muted/50"
                        onClick={() => setSheetOpen(false)}
                        prefetch={false}
                      >
                        Sign in
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Header;
