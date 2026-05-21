// mynclex/lib/payments/dup-check.ts
//
// "Does this email already have a MyNclex account?" — run BEFORE sending
// a guest to Paystack so a returning student logs in instead of paying as
// a stranger and creating a duplicate (payments-and-enrolment.md §164).
//
// We check nclex_users (our profile mirror, 1:1 with auth.users). Every
// completed account has a row here, so an email match means "real account
// exists, send them to log in." Reads via the service role because
// nclex_users is not publicly selectable.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function emailHasAccount(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!clean) return false;

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('nclex_users')
    .select('id')
    .ilike('email', clean)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Fail open: let checkout proceed. The post-payment race-guard (5.3)
    // still attaches to an existing account if one turns up.
    console.error('emailHasAccount lookup failed:', error.message);
    return false;
  }
  return !!data;
}
