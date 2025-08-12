import 'server-only';
import React from 'react';
import SignInCard from './SignInCard';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/supabase';

export default async function AuthPage() {
  const session = await getSession();
  if (session) {
    redirect('/chat');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
        {/* Left side - Features */}
        <div className="space-y-8 text-center lg:text-left lg:pl-12">
          <div className="space-y-4">
            <div className="w-72 h-18 mx-auto lg:mx-0 relative">
              <img 
                src="/logos/logo-horizontal.png" 
                alt="PatioAI" 
                className="w-full h-full object-contain"
              />
            </div>
            <div className="space-y-1 lg:pl-20">
              <h1 className="text-4xl lg:text-5xl font-medium tracking-tight">
                Group AI Chats
              </h1>
              <h1 className="text-4xl lg:text-5xl font-medium tracking-tight text-muted-foreground/70">
                Made Simple
              </h1>
            </div>
          </div>
          
          <div className="space-y-4 max-w-md mx-auto lg:mx-0 lg:pl-20">
            <div className="group flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-blue-50/40 to-transparent dark:from-blue-950/15 border border-blue-200/20 dark:border-blue-800/20 hover:border-blue-300/40 dark:hover:border-blue-700/40 transition-all duration-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="font-medium text-sm mb-0.5">Create Rooms</h3>
                <p className="text-muted-foreground/80 text-xs leading-relaxed">Start collaborative AI conversations with your team</p>
              </div>
            </div>
            
            <div className="group flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-emerald-50/40 to-transparent dark:from-emerald-950/15 border border-emerald-200/20 dark:border-emerald-800/20 hover:border-emerald-300/40 dark:hover:border-emerald-700/40 transition-all duration-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="font-medium text-sm mb-0.5">Share Links</h3>
                <p className="text-muted-foreground/80 text-xs leading-relaxed">Invite anyone instantly with shareable room links</p>
              </div>
            </div>
            
            <div className="group flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-50/40 to-transparent dark:from-purple-950/15 border border-purple-200/20 dark:border-purple-800/20 hover:border-purple-300/40 dark:hover:border-purple-700/40 transition-all duration-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="font-medium text-sm mb-0.5">Start Chatting</h3>
                <p className="text-muted-foreground/80 text-xs leading-relaxed">Get AI insights together in real-time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Sign in */}
        <div className="flex justify-center lg:justify-center">
          <SignInCard />
        </div>
      </div>
    </div>
  );
}
