// mynclex/lib/supabase/client.ts
//
// Browser-side Supabase client.
// Used inside Client Components ("use client").
//
// Per MyNclex CLAUDE.md rule #4: create the client per-request, never at
// module scope — warm runtimes can leak sessions between users otherwise.
// That's why this file exports a FUNCTION, not a client instance.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
