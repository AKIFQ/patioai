import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/server/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/signin';

  // Use configured app URL instead of request origin to avoid localhost:8080 redirects
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_CLIENT_URL || 'https://www.patioai.chat';

  if (code) {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const redirectTo = new URL(next, appUrl);
      redirectTo.searchParams.set(
        'message',
        encodeURIComponent('You are now signed in')
      );
      return NextResponse.redirect(redirectTo);
    }
  }

  const redirectTo = new URL('/signin', appUrl);
  redirectTo.searchParams.set(
    'message',
    encodeURIComponent('An error have occoured')
  );
  return NextResponse.redirect(redirectTo);
}
