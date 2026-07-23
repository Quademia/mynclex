// mynclex/lib/home/student/bank/queries.ts
//
// Assembles the Bank Dashboard from reads that already exist — no new
// tables, no migration. The route calls getBankDashboardData() once and
// hands the result to the view.
//
// What counts as "bank activity" here (settled 2026-07-22, card 3):
// CUSTOM_BUILT attempts (including CAT) and READINESS_PACK sittings.
// PROGRAMME_ASSIGNED attempts are deliberately excluded — those belong
// to the programme home's own streak, and a student in both products
// should not see one surface's work inflate the other's.
//
// Note the split that appears again in later stages: a CAT counts as
// ACTIVITY (it is study, it keeps a streak alive) but must not count as
// a MASTERY signal (§13.2 — a CAT serves at the edge of ability, so raw
// correctness converges toward 50% for everyone). Streak: CAT in.
// Accuracy: CAT out.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { bankAccessForUser } from '@/lib/payments/entitlements';
import { accessCard, bankStreak, todayLabel } from './format';
import type { BankDashboardData } from './types';

/** Attempt sources that belong to the bank product. */
const BANK_SOURCES = ['CUSTOM_BUILT', 'READINESS_PACK'];

export async function getBankDashboardData(): Promise<BankDashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The route gate runs first, so this is defensive only.
  if (!user) {
    return {
      firstName: '',
      todayLabel: todayLabel(new Date()),
      access: null,
      streak: bankStreak([], Date.now()),
    };
  }

  const [profileRes, access, activityRes] = await Promise.all([
    supabase.from('nclex_users').select('forename').eq('id', user.id).maybeSingle(),
    bankAccessForUser(supabase, user.id),
    // The streak feed: one row per bank attempt, cheapest possible
    // select. started_at is the true "I sat down to study" moment;
    // created_at covers a row that was built but never started.
    supabase
      .from('nclex_attempts')
      .select('started_at, created_at')
      .eq('student_id', user.id)
      .in('source', BANK_SOURCES),
  ]);

  const now = new Date();
  const activeAt = (activityRes.data ?? [])
    .map((r) => (r.started_at ?? r.created_at) as string | null)
    .filter((s): s is string => !!s);

  return {
    firstName: (profileRes.data?.forename ?? '').trim(),
    todayLabel: todayLabel(now),
    access: accessCard(access.daysLeft, access.windowDays),
    streak: bankStreak(activeAt, now.getTime()),
  };
}
