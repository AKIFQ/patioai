import 'server-only';
import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSession, hasExistingContent } from '@/lib/server/supabase';

export default async function LandingPage() {
  const session = await getSession();
  
  // If user is authenticated and has existing content, redirect to chat
  if (session) {
    const hasContent = await hasExistingContent();
    if (hasContent) {
      redirect('/chat');
    }
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Welcome
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Your application is ready to be customized.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {session ? (
            <Button asChild size="lg">
              <Link href="/chat">
                Go to Chat
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/signin">
                  Sign In
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/signup">
                  Sign Up
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
