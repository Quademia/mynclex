// mynclex/lib/supabase/server.ts
//
// Server-side Supabase client.
// Used inside Server Components, Server Actions, and Route Handlers.
//
// Per MyNclex CLAUDE.md rule #4: create per-request (this function is called
// per request), never at module scope.
// Per MyNclex CLAUDE.md rule #4: never call getSession() on the server —
// always use getUser() or getClaims(). The functions below wrap those.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware will refresh
            // cookies on the next request instead. Safe to ignore.
          }
        },
      },
    }
  );
}
