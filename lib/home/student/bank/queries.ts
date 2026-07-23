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
// A study day requires an ANSWERED question, not merely an attempt row
// (settled with Sam 2026-07-23) — see ./streak for why.
//
// Note the split that appears again in later stages: a CAT counts as
// ACTIVITY (it is study, it keeps a streak alive) but must not count as
// a MASTERY signal (§13.2 — a CAT serves at the edge of ability, so raw
// correctness converges toward 50% for everyone). Streak: CAT in.
// Accuracy: CAT out.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { bankAccessForUser } from '@/lib/payments/entitlements';
import { getResumableAttempt } from '@/lib/practice/launchers/get-resumable-attempt';
// A pure presentational helper that happens to live under lib/enrolments.
// Reused rather than copied — the repo already carries three near-identical
// implementations of this and a fourth would be worse than the import.
import { relativeTime } from '@/lib/enrolments/format';
import { accessCard, bankStreak, todayLabel } from './format';
import { bankAccuracy, type AnsweredRow } from './accuracy';
import type { BankDashboardData, ResumeCard } from './types';

/** Attempt sources that belong to the bank product. */
const BANK_SOURCES = ['CUSTOM_BUILT', 'READINESS_PACK'];

// A real answer. SKIPPED means the student passed on the question and
// DRAFT is the time-engine's placeholder row for one they only read —
// neither is "I answered a question", so neither keeps a streak alive.
const ANSWERED_STATUSES = ['SUBMITTED', 'AUTO_SUBMITTED'];

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
      resume: null,
      accuracy: bankAccuracy([]),
    };
  }

  const [profileRes, access, activityRes, accuracyRes, resumable] = await Promise.all([
    supabase.from('nclex_users').select('forename').eq('id', user.id).maybeSingle(),
    bankAccessForUser(supabase, user.id),
    // The streak feed: one row per ANSWERED question, inner-joined to
    // its attempt so programme-assigned work is filtered out in the
    // database rather than after the fact.
    supabase
      .from('nclex_attempt_answers')
      .select('submitted_at, updated_at, created_at, nclex_attempts!inner(source)')
      .eq('student_id', user.id)
      .in('submission_status', ANSWERED_STATUSES)
      .in('nclex_attempts.source', BANK_SOURCES),

    // The mastery read: every answered non-CAT bank question with the
    // classification that was SNAPSHOTTED onto it at the time. Reading
    // the snapshot rather than the live bank item is what makes this a
    // record of what the student actually sat.
    supabase
      .from('nclex_attempt_answers')
      .select(
        'is_correct, nclex_attempt_items!inner(classification_snapshot), nclex_attempts!inner(source, mode)',
      )
      .eq('student_id', user.id)
      .in('submission_status', ANSWERED_STATUSES)
      .in('nclex_attempts.source', BANK_SOURCES)
      .neq('nclex_attempts.mode', 'CAT'),

    getResumableAttempt(BANK_SOURCES),
  ]);

  const now = new Date();
  // submitted_at is the right timestamp but is not guaranteed present
  // (a handful of SUBMITTED rows carry none), and dropping those would
  // silently punch holes in the streak — so fall back rather than lose
  // the day.
  const answeredAt = (activityRes.data ?? [])
    .map((r) => (r.submitted_at ?? r.updated_at ?? r.created_at) as string | null)
    .filter((s): s is string => !!s);

  // The embedded item comes back as an array or a single object
  // depending on how PostgREST reads the relationship — normalise
  // rather than assume.
  const answeredRows: AnsweredRow[] = (accuracyRes.data ?? []).map((r) => {
    const embed = r.nclex_attempt_items as unknown;
    const item = (Array.isArray(embed) ? embed[0] : embed) as
      | { classification_snapshot?: Record<string, unknown> | null }
      | null
      | undefined;
    const sub = item?.classification_snapshot?.client_needs_subcategory;
    return {
      subcategory: typeof sub === 'string' && sub ? sub : null,
      isCorrect: r.is_correct === true,
    };
  });

  const resume: ResumeCard | null = resumable
    ? {
        attemptId: resumable.attempt_id,
        modeLabel: resumable.mode_label,
        done: resumable.done,
        total: resumable.total,
        savedWhen: relativeTime(resumable.last_activity_at),
        href: `/session/${resumable.attempt_id}`,
      }
    : null;

  return {
    firstName: (profileRes.data?.forename ?? '').trim(),
    todayLabel: todayLabel(now),
    access: accessCard(access.daysLeft, access.windowDays),
    streak: bankStreak(answeredAt, now.getTime()),
    resume,
    accuracy: bankAccuracy(answeredRows),
  };
}
