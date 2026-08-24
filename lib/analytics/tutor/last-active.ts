// mynclex/lib/analytics/tutor/last-active.ts
//
// "Last active" — a truer engagement signal than completion alone.
//
// ⚠ progress-engine.md recorded the Phase-1 limitation: "Last active = last
// completion (Phase 1 reads completion only); a truer last-seen would need
// a login/view signal." That is out of date. Attempts carry
// `last_activity_at` (a heartbeat written while a sitting is open) and
// `started_at`, so a student grinding through a quiz they never submit IS
// visible — and under completion-only they read as stone dead.
//
// ⭐⭐ THE DEFINITION LIVES IN SQL, NOT HERE. `nclex_programme_last_active`
// (migration 20260922120000) fuses the three sources, and this module is a
// thin caller. The nightly inactivity sweep calls the same function.
//
// That is the whole point: the sweep decides who gets emailed and this
// decides who the tutor sees flagged as "Stalled", and if the two were
// written separately they would drift — the screen naming a student the
// system never wrote to, or the reverse. Two stories about one person.
// One definition, two readers, no drift possible.
//
// ⚠ The SQL is SECURITY INVOKER, so the tutor's own RLS gates it: the read
// policies on progress rows, note state and attempts all resolve ownership
// by walking activity → unit → programme → tutor. Nothing new was granted
// to make this work, and a caller who cannot see the programme gets rows
// they were always entitled to — none.
//
// ⚠ Deliberately NOT nclex_users.last_login_utc, in either caller. It is
// product-wide, so a student who also grinds the question bank looks
// permanently active on a programme they abandoned in March. It answers
// "have they vanished entirely" — a different question from "have they
// abandoned THIS programme", and the second is the one a tutor is asking
// on a programme page. Conflating them yields a confidently wrong green
// light, which is worse than the gap it closes.
//
// ⓘ Also absent: nclex_library_shelf_seen.seen_at, a genuine view signal —
// but it carries no tutor read policy, and widening RLS to catch shelf
// opens alone was not worth the surface area. Noted rather than done.

import type { createClient } from '@/lib/supabase/server';

type LastActiveRow = {
  student_id: string;
  last_active_at: string | null;
};

/**
 * Latest engagement timestamp per student on one programme.
 *
 * Returns `studentId → ISO timestamp`. Students with no engagement at all
 * are simply absent — the caller treats an absence as "never active",
 * which is exactly what it means.
 */
export async function getProgrammeLastActive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programmeId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const { data, error } = await supabase.rpc('nclex_programme_last_active', {
    p_programme_id: programmeId,
  });
  // A failure here must not take the page down — completion still renders,
  // and every student simply reads as never-active until it recovers.
  if (error) return out;

  for (const r of (data ?? []) as LastActiveRow[]) {
    if (r.last_active_at) out.set(r.student_id, r.last_active_at);
  }
  return out;
}

/**
 * Per-enrolment timestamp of the last inactivity nudge actually SENT.
 *
 * ⓘ SENT, not queued — a row waiting on the drain has reached nobody, and
 * a tutor about to ring somebody needs to know whether we really wrote to
 * them this morning.
 *
 * ⚠ The underlying function is SECURITY DEFINER (the outbox is admin-only)
 * and re-checks programme ownership inside. It returns a timestamp and
 * never payload content.
 */
export async function getProgrammeNudgeHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programmeId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const { data, error } = await supabase.rpc('nclex_programme_nudge_history', {
    p_programme_id: programmeId,
  });
  if (error) return out;

  for (const r of (data ?? []) as Array<{
    enrolment_id: string;
    last_nudged_at: string | null;
  }>) {
    if (r.last_nudged_at) out.set(r.enrolment_id, r.last_nudged_at);
  }
  return out;
}

/** Whole days between an ISO timestamp and now, floored at 0. */
export function daysSince(iso: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000));
}
