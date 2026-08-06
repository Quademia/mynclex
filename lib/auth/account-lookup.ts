// mynclex/lib/auth/account-lookup.ts
//
// "Does this address have an account here?" — asked by the reset flow,
// which needs the answer to do its job, and recorded by the login and
// reset logs, which need it to answer support.
//
// ⭐ THE ANSWER IS FOR US, NOT FOR THE VISITOR. This is the whole reason
// the function exists (settled with Sam, 2026-08-06). The PAGE must never
// betray whether an address is registered — a form that says "no such
// account" is a tool for discovering who has one, and an attacker will
// feed it ten thousand addresses to build a target list. But the admin
// reading a support case sits behind a login, a role check and an RLS
// policy, and there is no reason for them to inherit the visitor's
// blindfold. Same event, two audiences, two different answers.
//
// ⚠ SO: NOTHING THIS RETURNS MAY EVER REACH THE USER. Not in an error
// message, not in a response body, not in a redirect, not in the timing
// of the reply. The moment it does, we have rebuilt the enumeration
// oracle we deliberately declined to build — and with more effort than
// simply leaving the message specific would have taken.
//
// WHY RECORD IT AT ALL, when an admin could just search the user list?
// Because a lookup done later answers "does this address exist NOW",
// which is a different question. A student who mistypes her address on
// Monday, realises, and registers properly on Tuesday leaves a Monday row
// that a Wednesday search reads as "her account existed, so it was a
// password problem" — the log would be actively misleading and nobody
// would know. A fact captured when it was true does not drift. It also
// separates two attacks that look identical today: many failures against
// addresses that DON'T exist is enumeration, many against addresses that
// DO is credential stuffing.

import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * True / false, or null when the lookup itself failed.
 *
 * The three-way return is deliberate: null means "we could not find out",
 * which is honest, whereas defaulting a failed lookup to false would
 * write a wrong fact into an append-only table that nothing is allowed to
 * correct later.
 *
 * Uses the service-role client because the caller is usually anonymous —
 * a visitor on the forgot-password form has no session, and nclex_users
 * is not readable without one.
 *
 * ⚠ KNOWN GAP: this reads nclex_users (our profiles), not auth.users
 * (Supabase's accounts), and they can disagree for one narrow window —
 * a pay-first buyer between paying and finishing setup at /welcome has
 * an auth account but no profile row, so she reads here as "no account".
 * It affects only the LOGGED FLAG, never the flow: resetPasswordForEmail
 * works off auth.users regardless, so she can still reset. Closing it
 * properly needs a SECURITY DEFINER function over auth.users, since
 * PostgREST does not expose that schema — worth doing if support ever
 * meets the case, not worth a migration in advance.
 */
export async function accountExistsForEmail(
  email: string
): Promise<boolean | null> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return null;

  try {
    const { data, error } = await createServiceRoleClient()
      .from('nclex_users')
      .select('id')
      // eq, not ilike. ilike would treat '_' as a single-character
      // wildcard, and underscores are ordinary in email addresses
      // (first_last@…), so 'a_b@x.com' would match 'axb@x.com' and
      // report an account that isn't theirs.
      .eq('email', normalised)
      .maybeSingle();

    if (error) {
      console.error('[account-lookup] failed', error.message);
      return null;
    }

    return data !== null;
  } catch (err) {
    console.error('[account-lookup] failed', err);
    return null;
  }
}
