// mynclex/middleware.ts
//
// Runs on every request before page render.
//
// Two jobs:
//   1. Refresh the Supabase auth cookie if it's close to expiring.
//      (Without this, users get silently signed out after the token TTL.)
//   2. Route guards — redirect based on auth state and path.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Paths that require an authenticated session.
const AUTH_REQUIRED_PREFIXES = ['/dashboard', '/router', '/no-access', '/logout'];

// Paths that should redirect to /router if the user IS already signed in.
const AUTH_FORBIDDEN_PATHS = ['/login', '/register'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() forces a revalidation with Supabase's auth server.
  // Never use getSession() here — per MyNclex CLAUDE.md rule #4.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const needsAuth = AUTH_REQUIRED_PREFIXES.some((p) => path.startsWith(p));
  if (needsAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  const shouldBounce = AUTH_FORBIDDEN_PATHS.includes(path);
  if (shouldBounce && user) {
    const routerUrl = request.nextUrl.clone();
    routerUrl.pathname = '/router';
    return NextResponse.redirect(routerUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
