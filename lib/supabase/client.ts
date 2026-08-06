// mynclex/lib/supabase/client.ts
//
// Browser-side Supabase client.
// Used inside Client Components ("use client").
//
// Per MyNclex CLAUDE.md rule #4: create the client per-request, never at
// module scope — warm runtimes can leak sessions between users otherwise.
// That's why this file exports a FUNCTION, not a client instance.

import { createBrowserClient } from '@supabase/ssr';

// ⚠ TWO THINGS ABOUT THIS CLIENT THAT ARE NOT OPTIONAL, verified against
// the installed @supabase/ssr 0.5.2 source on 2026-08-06 after a wasted
// fix attempt. Read before trying to configure it:
//
//   1. `detectSessionInUrl` CANNOT BE TURNED OFF. createBrowserClient
//      sets it (and flowType, persistSession, autoRefreshToken, storage)
//      AFTER spreading your options, so anything you pass for those keys
//      is discarded without a warning. The client will always consume an
//      auth token it finds in the URL, and always wipe the address bar
//      afterwards.
//   2. It is a MODULE-LEVEL SINGLETON in the browser. The first call
//      builds the client; every later call returns that same instance and
//      ignores its arguments entirely.
//
// Together: a page cannot opt out of the library's URL handling, and must
// not try to do that work itself in parallel — the two race for a
// single-use code and the loser reports a failure that did not happen.
// The supported shape is to let the client do the exchange and WAIT for
// the session (see app/reset-password/page.tsx).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
