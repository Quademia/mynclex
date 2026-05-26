// mynclex/lib/supabase/server.ts
//
// Server-side Supabase client.
// Used inside Server Components, Server Actions, and Route Handlers.
//
// Per MyNclex CLAUDE.md rule #4: create per-request (this function is called
// per request), never at module scope.
// Per MyNclex CLAUDE.md rule #4: never call getSession() on the server —
// always use getUser() or getClaims(). The functions below wrap those.
//
// createServiceRoleClient() returns a client that bypasses RLS. Used only
// where the application has already verified access at a higher layer
// (e.g. minting signed URLs for an asset after the consumer's own RLS has
// gated the row). Per CLAUDE.md rule #5, the service role key never leaves
// the server.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
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

// Service-role client — bypasses RLS. Use ONLY when the application has
// already verified access at a higher layer (e.g. the consumer table's
// own RLS gated the upstream row). Never expose to the browser.
//
// Per-request creation (no module-scope cache) — matches the rule on
// createClient() above and avoids warm-runtime leakage between requests.
export function createServiceRoleClient(): SupabaseClient {
  return createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
