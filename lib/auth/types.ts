// mynclex/lib/auth/types.ts
//
// Shared types for the lib/auth gate helpers.
//
// Every public helper that succeeds returns a context payload with:
//   - supabase: the per-request Supabase server client (so callers can
//     keep querying without instantiating a second client)
//   - user:     the verified auth user (already non-null at this point)
//   - roles:    the user's role memberships (e.g. ['ADMIN'])
//   - permissions: admin permission buckets (empty array for helpers
//     that don't fetch permissions — keeps the type stable across all
//     return shapes so call sites never have to narrow)
//
// SupabaseClient type comes from the actual return type of our
// per-request server-client factory (lib/supabase/server.ts) rather
// than @supabase/supabase-js directly, so the type tracks any future
// wrapper changes.

import type { User } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase/server';

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthGateResult = {
  supabase: ServerSupabaseClient;
  user: User;
  roles: string[];
  permissions: string[];
};
