// mynclex/lib/auth/shared/require-bank-curator.ts
//
// Surface-aware gate for bank authoring. Used by Server Actions in
// the bank, case-study, and trend folders that serve both /admin and
// /tutor URLs from a single shared module.
//
//   - Admin surface: BANK_CURATE permission OR SUPER_ADMIN.
//                    Failure → /admin/dashboard.
//   - Tutor surface: TUTOR role OR SUPER_ADMIN.
//                    Failure → /no-access.
//
// Branches the loader on surface so the tutor path doesn't waste a
// round-trip on the (unused) permissions table.
//
// Replaces three near-duplicate inline helpers consolidated in this
// slice:
//   - requireSurfaceAuth in app/(app)/admin/bank/actions.ts
//   - requireCaseCurator in lib/bank/case-study/actions.ts
//   - requireTrendCurator in lib/bank/trend/actions.ts

import { redirect } from 'next/navigation';
import { loadAuthContext, loadRolesOnly } from '../internal';
import type { AuthGateResult } from '../types';

export type BankSurface = 'admin' | 'tutor';

export async function requireBankCurator(
  surface: BankSurface,
): Promise<AuthGateResult> {
  if (surface === 'tutor') {
    const ctx = await loadRolesOnly();
    const allowed =
      ctx.roles.includes('TUTOR') || ctx.roles.includes('SUPER_ADMIN');
    if (!allowed) redirect('/no-access');
    return ctx;
  }

  // surface === 'admin'
  const ctx = await loadAuthContext();
  const allowed =
    ctx.roles.includes('SUPER_ADMIN') || ctx.permissions.includes('BANK_CURATE');
  if (!allowed) redirect('/admin/dashboard');
  return ctx;
}
