// mynclex/lib/analytics/tutor/last-active.ts
//
// "Last active" — a truer engagement signal than completion alone.
//
// ⚠ progress-engine.md records the Phase-1 limitation: "Last active = last
// completion (Phase 1 reads completion only); a truer last-seen would need
// a login/view signal." That is no longer the whole story. Attempts carry
// `last_activity_at` (a heartbeat written while a sitting is open) and
// `started_at`, so a student grinding through a quiz they never submit IS
// visible — and under completion-only they read as stone dead.
//
// That matters most on the self-paced surface, where "stalled" is the
// primary status rather than a footnote: flagging a working student as
// stalled sends the tutor to chase somebody who is right there.
//
// Scope + permission. Attempts are student-private except through
// nclex_attempts_tutor_read (migration 20260628120000), which grants a
// tutor the attempts belonging to THEIR programmes, in the two mutually
// exclusive shapes nclex_attempts_source_refs allows:
//   • standalone        — programme_id + quiz_id set
//   • activity-launched — programme_activity_id set
// Both are read here. Bank attempts (neither set) stay private, which is
// correct — a student's own bank practice is not their tutor's business,
// and this signal is deliberately programme-scoped.
//
// ⚠ Deliberately NOT used here: nclex_users.last_login_utc. It is
// product-wide, so a student who also grinds the question bank looks
// permanently "active" on a programme they abandoned in March. It answers
// "have they vanished entirely", which is a different question from "have
// they abandoned THIS programme" — and the second is what a tutor is
// asking on a programme page. Conflating them yields a confidently wrong
// green light, which is worse than the gap it closes.
//
// ⓘ Also absent: nclex_library_shelf_seen.seen_at, a genuine view signal —
// but it carries no tutor read policy, and widening RLS to catch shelf
// opens alone was not worth the surface area. Noted rather than done.

import type { createClient } from '@/lib/supabase/server';

type AttemptActivityRow = {
  student_id: string;
  last_activity_at: string | null;
  started_at: string | null;
  created_at: string;
};

const COLS = 'student_id, last_activity_at, started_at, created_at';

/** Most recent engagement stamp on a row, whichever one it managed to write. */
function stampOf(r: AttemptActivityRow): string {
  return r.last_activity_at ?? r.started_at ?? r.created_at;
}

/**
 * Latest quiz-attempt engagement per student, for one programme.
 *
 * Returns `studentId → ISO timestamp`. Students with no attempts are simply
 * absent — the caller fuses this with completion timestamps and keeps the
 * later of the two, so an absence costs nothing.
 *
 * ⚠ Every status counts, IN_PROGRESS included. An unfinished sitting is the
 * exact case this exists for: engagement that completion never sees.
 */
export async function getLastQuizActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programmeId: string,
  studentIds: string[],
  activityIds: string[],
): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (studentIds.length === 0) return latest;

  const studentIdSet = new Set(studentIds);

  const [standaloneRes, activityRes] = await Promise.all([
    // ⚠ The .eq() is load-bearing, not decorative. A SUPER_ADMIN also holds
    // an admin-all policy on this table, and RLS is an OR across policies —
    // so without an explicit programme filter this would return EVERY
    // attempt in the product for that reader. Same trap as the enrolment
    // self-read one (feedback: "RLS OR is not a WHERE clause").
    supabase.from('nclex_attempts').select(COLS).eq('programme_id', programmeId),
    activityIds.length
      ? supabase
          .from('nclex_attempts')
          .select(COLS)
          .in('programme_activity_id', activityIds)
      : Promise.resolve({ data: [] as AttemptActivityRow[] }),
  ]);

  for (const res of [standaloneRes, activityRes]) {
    for (const r of (res.data ?? []) as AttemptActivityRow[]) {
      if (!studentIdSet.has(r.student_id)) continue;
      const ts = stampOf(r);
      const prev = latest.get(r.student_id);
      if (!prev || ts > prev) latest.set(r.student_id, ts);
    }
  }

  return latest;
}

/** Whole days between an ISO timestamp and now, floored at 0. */
export function daysSince(iso: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000));
}
