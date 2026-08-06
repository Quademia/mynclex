// mynclex/lib/supabase/client.ts
//
// Browser-side Supabase client.
// Used inside Client Components ("use client").
//
// Per MyNclex CLAUDE.md rule #4: create the client per-request, never at
// module scope — warm runtimes can leak sessions between users otherwise.
// That's why this file exports a FUNCTION, not a client instance.

import { createBrowserClient } from '@supabase/ssr';

/**
 * @param opts.detectSessionInUrl
 *   Leave unset (the default, true) everywhere except a page that reads
 *   an auth link's token out of the URL itself.
 *
 *   ⚠ WHY THE ESCAPE HATCH EXISTS. The client normally watches the URL
 *   for auth tokens and consumes them on its own, then wipes the address
 *   bar. On a page that ALSO reads that token deliberately, the two race
 *   for a strictly single-use code: whichever arrives second fails, and
 *   the page reports "this link didn't work" for a reset that actually
 *   succeeded. That is not hypothetical — it is what /reset-password did
 *   on its first live test (2026-08-06), and the flash of the real URL
 *   being replaced by a bare one was the library tidying up mid-race.
 *
 *   Turning it off hands the page sole ownership of the token, which is
 *   what lets /reset-password enforce the rule that matters there: it
 *   must act on the LINK's identity, never on whoever happens to be
 *   signed in on the device already.
 *
 *   ⓘ /welcome has the same shape and does NOT pass this yet. It survives
 *   because invite links arrive as tokens rather than a single-use code,
 *   and setting a session twice is harmless where spending a code twice
 *   is not. It is standing on the same floorboard — fix it next time
 *   there is a reason to be in that file and an invite to test with.
 */
export function createClient(opts?: { detectSessionInUrl?: boolean }) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    opts?.detectSessionInUrl === false
      ? { auth: { detectSessionInUrl: false } }
      : undefined
  );
}
