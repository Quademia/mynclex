// mynclex/lib/access/student/require-active-bank-subscription.ts
//
// Student-side gate for the bank surfaces (Slice 5.6). Two checks:
//   1. STUDENT role (requireStudent) — the bank is the learner space.
//   2. An active bank subscription (bankAccessForUser, the TS mirror of
//      nclex_has_active_bank_access). No active access → the reason-aware
//      access wall (/no-access?need=bank), which explains what's locked
//      and offers the bank-plans CTA (and a packs link if they own one).
//
// SUPER_ADMIN bypass: a super-admin who also holds STUDENT keeps access
// without a subscription, for tooling/testing (matches the RPC's bypass).
// This is the TS/UX layer; the hard backstop is the same check inside the
// nclex_create_attempt RPC.

import { redirect } from 'next/navigation';
import { bankAccessForUser } from '@/lib/payments/entitlements';
import { requireStudent } from './require-student';
import type { AuthGateResult } from '../types';

export async function requireActiveBankSubscription(): Promise<AuthGateResult> {
  const ctx = await requireStudent();
  if (ctx.roles.includes('SUPER_ADMIN')) return ctx;

  const access = await bankAccessForUser(ctx.supabase, ctx.user.id);
  if (!access.active) redirect('/no-access?need=bank');

  return ctx;
}
