import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Initialize Supabase client and handle session
  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // Get user session using the proper auth method
  const { data: { user }, error } = await supabase.auth.getUser();

  // Handle route-specific redirects
  const currentRoute = request.nextUrl.pathname;
  if (currentRoute.startsWith('/protected') && !user) {
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = '/signin';
    return NextResponse.redirect(redirectUrl);
  }

  // Allow anonymous access to room chats, but require auth for regular chats
  if (currentRoute.startsWith('/chat') && !user) {
    // Allow room chats for anonymous users
    if (currentRoute.startsWith('/chat/room/')) {
      return response;
    }
    
    // Redirect regular chats to signin
    const redirectUrl = new URL(request.url);
    redirectUrl.pathname = '/signin';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
// Matcher to exclude certain paths from middleware
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|favicons/.*\\.png|manifest.webmanifest|manifest.json|api/auth|api/debug|fonts/.*|sitemap.xml|robots.txt|manifest.json|manifest.webmanifest|\\.well-known/.*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' }
      ]
    }
  ]
};
