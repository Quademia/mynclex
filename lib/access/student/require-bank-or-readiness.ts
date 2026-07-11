// mynclex/lib/access/student/require-bank-or-readiness.ts
//
// The RELAXED front-door gate for the bank space (2026-07-09 IA
// decision, readiness-packs.md §11.10). The bank shell is entered by
// anyone who has active bank access OR owns a readiness entitlement —
// so a student who bought only readiness packs (no bank subscription)
// can reach the Readiness Packs page, which lives inside the bank
// sidebar.
//
// This gate protects ENTRY only. The bank-consumption pages
// (dashboard / practice / history / journey / profile) each keep their
// own requireActiveBankSubscription() call, so a readiness-only student
// who clicks Practice still bounces to the reason-aware access wall
// (/no-access?need=bank) — the sidebar is shared, the entitlements are
// not. The Readiness Packs page adds no bank check: getting through this
// door is enough.
//
// A student with NEITHER bank access nor readiness bounces to the same
// access wall. SUPER_ADMIN + STUDENT bypasses (matches the bank gate).

import { redirect } from 'next/navigation';
import { bankAccessForUser, ownsReadinessForUser } from '@/lib/payments/entitlements';
import { requireStudent } from './require-student';
import type { AuthGateResult } from '../types';

export async function requireBankOrReadiness(): Promise<AuthGateResult> {
  const ctx = await requireStudent();
  if (ctx.roles.includes('SUPER_ADMIN')) return ctx;

  const access = await bankAccessForUser(ctx.supabase, ctx.user.id);
  if (access.active) return ctx;

  if (await ownsReadinessForUser(ctx.supabase, ctx.user.id)) return ctx;

  redirect('/no-access?need=bank');
}
