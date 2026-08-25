// mynclex/lib/cohorts/attendance-actions.ts
//
// Tutor server actions for live-session attendance (Slice 3). Mark one
// student's status for a session, or mark the whole roster present in one
// go. RLS on nclex_cohort_session_attendance enforces ownership (chain
// attendance -> session -> cohort -> programme -> tutor); these add the
// status guard + stamp marked_by/marked_at. Marking PRESENT derives an
// ATTENDANCE progress row via the DB trigger (nclex_progress_on_attendance);
// ABSENT/EXCUSED clear it. The client refreshes on drawer close.
//
// import-only of the shared status type/guard (this file is 'use server';
// it must not re-export types — see the no-type-reexport gotcha).

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCohortRoster } from '@/lib/enrolments/queries';
import { ownedCohortProgrammeId } from './tutor-scope';
import { isAttendanceStatus } from './attendance-format';
import type { AttendanceStatus } from './attendance-format';

export type AttendanceResult = { ok: true } | { ok: false; error: string };

export async function markAttendanceAction(
  sessionId: string,
  studentId: string,
  status: AttendanceStatus,
): Promise<AttendanceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (!isAttendanceStatus(status)) {
    return { ok: false, error: 'Invalid attendance status.' };
  }

  // ⚠ Ownership gate. This relied entirely on RLS rejecting the
  // upsert, which is a coin-flip on the outcome: an INSERT that
  // violates the policy raises, but an ON CONFLICT DO UPDATE that
  // matches nothing need not — and this only inspects `error`. Resolve
  // the session's cohort and prove the caller owns it first.
  // Sibling markAllPresentAction is already gated this way, through
  // getCohortRoster. See lib/programmes/tutor-scope.ts.
  const { data: sess } = await supabase
    .from('nclex_cohort_live_sessions')
    .select('cohort_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  const cohortId = (sess as { cohort_id: string } | null)?.cohort_id ?? null;
  if (
    !cohortId ||
    !(await ownedCohortProgrammeId(supabase, cohortId, user.id))
  ) {
    return { ok: false, error: 'Could not save attendance.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('nclex_cohort_session_attendance')
    .upsert(
      {
        session_id: sessionId,
        student_id: studentId,
        status,
        marked_by: user.id,
        marked_at: now,
        updated_at: now,
      },
      { onConflict: 'session_id,student_id' },
    );

  // RLS rejects a session the tutor doesn't own → generic error (no probe).
  if (error) return { ok: false, error: 'Could not save attendance.' };
  return { ok: true };
}

export async function markAllPresentAction(
  cohortId: string,
  sessionId: string,
): Promise<AttendanceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Re-derive the roster server-side (don't trust a client list). Ownership
  // is gated inside getCohortRoster (null → not the caller's cohort).
  const roster = await getCohortRoster(cohortId);
  if (roster === null) return { ok: false, error: 'Cohort not found.' };
  const enrolled = roster.filter((r) => r.status === 'ENROLLED');
  if (enrolled.length === 0) return { ok: true };

  const now = new Date().toISOString();
  const rows = enrolled.map((r) => ({
    session_id: sessionId,
    student_id: r.user_id,
    status: 'PRESENT' as const,
    marked_by: user.id,
    marked_at: now,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('nclex_cohort_session_attendance')
    .upsert(rows, { onConflict: 'session_id,student_id' });

  if (error) return { ok: false, error: 'Could not mark the roster present.' };
  return { ok: true };
}
