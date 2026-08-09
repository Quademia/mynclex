// mynclex/lib/auth/events.ts
//
// The write side of nclex_auth_events — build-order item 2, slice 2a.
// Migration: db/migrations/20260904120000_auth_events.sql
//
// ⭐ THE ONE RULE: THIS MODULE NEVER THROWS AND NEVER BLOCKS.
// It sits in the login path. A logbook that can break a sign-in is worse
// than no logbook — it converts "support is blind" into "nobody can get
// in", which is the failure this whole build-order item exists to fix.
// So every failure mode (no headers, no service-role key, unreachable
// database, rejected row) ends the same way: a console line, and the
// caller carries on as if nothing happened. Pinned by events.test.ts.
//
// WHY THE SERVICE-ROLE CLIENT. Not a convenience. The most important row
// this table stores is a FAILED login, and a failed login has no session
// — auth.uid() is NULL, so no RLS policy we could write would let an
// ordinary client insert it. The table's RLS grants SELECT and nothing
// else on purpose (see the migration's section 3); writes come in over
// the top of it, and the absence of UPDATE/DELETE policies is what makes
// "append-only" something the database enforces rather than something
// call sites remember.

import 'server-only';

import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deviceLabelFrom } from './device-label';

// The full vocabulary, matching the CHECK constraint in the migration.
// CODE_* lands with slice 3 (email-code login) and GOOGLE_FIRST_SIGNIN
// with slice 5; they are named here and in the constraint now so those
// slices need no migration.
//
// ⚠ CORRECTED 2026-08-09 — "no migration" held for three of slice 3's four
// types, not all four. 2a foresaw the types describing what the STUDENT did
// (requested a code, signed in, got it wrong) and missed the one describing
// what WE did: refuse her before asking. CODE_BLOCKED cost
// 20260906120000_code_blocked.sql. The same blind spot is worth watching for
// in slice 5: GOOGLE_FIRST_SIGNIN is a success type with no refusal partner.
//
// *_BLOCKED are separate types rather than a flag on a fail because
// slice 2c must exclude blocked attempts from the counts that blocked
// them — otherwise the punishment feeds itself and one tripped limit
// keeps a student locked out by her own lockouts.
export type AuthEventType =
  | 'LOGIN_OK'
  | 'LOGIN_FAIL'
  | 'LOGIN_BLOCKED'
  | 'REGISTERED'
  // ⚠ The one type in this arc that was NOT free. 2a pre-loaded CODE_* and
  // GOOGLE_FIRST_SIGNIN into the constraint; this one arrived later, from
  // the /register gap, and cost a migration of its own
  // (20260905120000_register_rejected.sql).
  | 'REGISTER_REJECTED'
  | 'RESET_REQUESTED'
  | 'RESET_COMPLETED'
  | 'RESET_BLOCKED'
  | 'CODE_REQUESTED'
  | 'CODE_LOGIN_OK'
  | 'CODE_LOGIN_FAIL'
  // Both of slice 3's refusals — too many codes requested, too many wrong
  // codes entered — plus a Turnstile refusal on the request step. One type;
  // `reason` says which ('threshold_request_60min' / 'threshold_verify_10min'
  // / 'turnstile:<code>'), exactly as LOGIN_BLOCKED already does for three.
  | 'CODE_BLOCKED'
  | 'INVITE_ACCEPTED'
  | 'GOOGLE_FIRST_SIGNIN';

export type AuthEventInput = {
  eventType: AuthEventType;
  /** The address the caller typed. Lowercased here so call sites can't forget. */
  email?: string | null;
  /** Set when the attempt resolved to a real account. */
  userId?: string | null;
  /** Reset events only — see the column comment in the migration. */
  userExists?: boolean | null;
  /** Short note: 'invalid_credentials', 'threshold_10min', … */
  reason?: string | null;
};

// A very loose shape check, not a validator. Its whole job is to stop a
// junk header from costing us the ROW: ip_address is INET, so a malformed
// value makes Postgres reject the insert, and we would lose the event to
// protect a field nobody enforces on. Anything that isn't obviously an
// address becomes null and the row still lands.
const IP_SHAPE = /^[0-9a-fA-F:.]+$/;

/**
 * Best-effort client IP from the proxy headers, or null.
 *
 * Cloudflare sets CF-Connecting-IP and it is the trustworthy one in
 * production — it is written by the edge, not the caller. The two
 * fallbacks exist for local dev and any non-CF path; they are
 * caller-supplied and therefore spoofable, which is fine for a field
 * that no rule enforces on and would NOT be fine if slice 2c ever grew
 * an IP threshold. (It should not — see the migration.)
 *
 * Exported for testing: this is the parsing that can go wrong.
 */
export function clientIpFrom(get: (name: string) => string | null): string | null {
  const raw =
    get('cf-connecting-ip') ??
    // x-forwarded-for is a comma-separated chain; the client is first.
    get('x-forwarded-for')?.split(',')[0] ??
    get('x-real-ip');

  const ip = raw?.trim();
  if (!ip) return null;

  // Strip an IPv6 zone index ('fe80::1%eth0') — Postgres INET rejects it.
  const bare = ip.split('%')[0];
  if (!bare || !IP_SHAPE.test(bare)) return null;

  return bare;
}

/**
 * Record one authentication attempt. Fire-and-forget by contract:
 * awaiting it is safe, ignoring its result is expected, and it resolves
 * even when everything underneath has failed.
 */
export async function logAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    const h = await headers();

    const { error } = await createServiceRoleClient()
      .from('nclex_auth_events')
      .insert({
        event_type: input.eventType,
        email: input.email ? input.email.trim().toLowerCase() : null,
        user_id: input.userId ?? null,
        user_exists: input.userExists ?? null,
        device_label: deviceLabelFrom(h.get('user-agent')),
        ip_address: clientIpFrom((name) => h.get(name)),
        reason: input.reason ?? null,
      });

    // supabase-js reports failure by returning it, not by throwing — so
    // without this branch a rejected insert would be silent, and the
    // table would look healthy while recording nothing.
    if (error) {
      console.error('[auth-events] insert failed', input.eventType, error.message);
    }
  } catch (err) {
    console.error('[auth-events] could not log', input.eventType, err);
  }
}
