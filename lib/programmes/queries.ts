// mynclex/lib/programmes/queries.ts
//
// Server-side fetches for the programme tutor surfaces.
// Slice 9.2a — programmes lose date/seat columns to nclex_cohorts;
// the list rollup folds cohort counts into each row.
//
// RLS scopes SELECT to tutor_id = auth.uid() (SUPER_ADMIN bypass via
// nclex_programmes_admin_all). Co-tutored programmes will join in
// once the co-tutor join table lands; for v1 the creator is the sole
// tutor.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getCohortsForProgramme } from '@/lib/cohorts/queries';
import { cohortStatus } from '@/lib/cohorts/format';
import { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
import type { ProgrammeCardRow, ProgrammeListRow } from './types';

export async function getMyProgrammes(): Promise<ProgrammeListRow[]> {
  const supabase = await createClient();

  // PostgREST embedded resources:
  //   • nclex_cohorts(count) — flattened to cohort_count.
  //   • nclex_programme_payment_strategies(...) filtered to UPFRONT_FULL —
  //     the canonical full price the programme form's Price field reads
  //     in edit mode (slice 7e — replaces the retired price_minor column).
  //     Filtered on `kind=eq.UPFRONT_FULL` via the inner alias so we get
  //     at most one row; activation is irrelevant (we want the canonical
  //     price even if upfront is currently turned off).
  //
  // RLS on the embedded tables uses the same tutor-ownership rule via the
  // programme FK, so we only see the tutor's own rows.
  const { data, error } = await supabase
    .from('nclex_programmes')
    .select(
      `programme_id, title, tagline, description,
       delivery_mode, unit_label, length_units,
       price_currency, show_price_publicly,
       payment_collection_mode, access_window_days,
       status, updated_at,
       nclex_cohorts(count),
       upfront:nclex_programme_payment_strategies(total_price_minor)`
    )
    .eq('upfront.kind', 'UPFRONT_FULL')
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const { nclex_cohorts, upfront, ...rest } = row as typeof row & {
      nclex_cohorts: Array<{ count: number }> | null;
      upfront: Array<{ total_price_minor: number }> | null;
    };
    const cohort_count = nclex_cohorts?.[0]?.count ?? 0;
    const upfront_total_minor = upfront?.[0]?.total_price_minor ?? null;
    return { ...rest, cohort_count, upfront_total_minor } as ProgrammeListRow;
  });
}

/**
 * Enriched programme rows for the Programmes page cards — the base list
 * plus read-time roll-ups:
 *   • students — distinct ENROLLED count per programme (programme-level,
 *     so it covers tutor-led + self-paced). Read with the service-role
 *     client: enrolment rows aren't tutor-readable under RLS, but the
 *     programme ids all come from getMyProgrammes (RLS-proven ownership),
 *     so counting them is safe (same pattern as the cohort roster).
 *   • avgCompletion / health — for live tutor-led programmes only, the
 *     mean completion across their IN_PROGRESS cohorts (reuses the
 *     analytics engine, so the numbers match the Analytics tab + Home).
 *     null when there's no active cohort to measure → card shows no meter.
 *
 * Scale note: runs getCohortAnalytics once per active cohort — fine at
 * v1 scale; cache if a tutor ever has enough to feel it.
 */
export async function getMyProgrammesForList(): Promise<ProgrammeCardRow[]> {
  const programmes = await getMyProgrammes();
  if (programmes.length === 0) return [];

  const ids = programmes.map((p) => p.programme_id);

  // ── Student counts (service role; ids are owner-proven) ──────────────
  const admin = createServiceRoleClient();
  const { data: enrolments } = await admin
    .from('nclex_enrolments')
    .select('programme_id, user_id')
    .in('programme_id', ids)
    .eq('status', 'ENROLLED');
  const studentsByProgramme = new Map<string, Set<string>>();
  for (const r of (enrolments ?? []) as Array<{ programme_id: string; user_id: string }>) {
    const set = studentsByProgramme.get(r.programme_id) ?? new Set<string>();
    set.add(r.user_id);
    studentsByProgramme.set(r.programme_id, set);
  }

  // ── Cohort-derived signals for tutor-led programmes ──────────────────
  // One cohort fetch per tutor-led programme with cohorts, reused for BOTH
  // the schedule line (next start / has-open) and the completion roll-up
  // (live programmes only). Self-paced + zero-cohort programmes skip this.
  const tutorLedWithCohorts = programmes.filter(
    (p) => p.delivery_mode === 'TUTOR_LED' && p.cohort_count > 0,
  );
  const completionByProgramme = new Map<string, number>();
  const scheduleByProgramme = new Map<
    string,
    { hasOpenCohort: boolean; nextCohortStart: string | null }
  >();
  await Promise.all(
    tutorLedWithCohorts.map(async (p) => {
      const cohorts = await getCohortsForProgramme(p.programme_id);

      // Schedule: open = UPCOMING or IN_PROGRESS; next start = earliest
      // upcoming start_date (ISO dates sort lexically).
      const hasOpenCohort = cohorts.some((c) => {
        const s = cohortStatus(c);
        return s === 'UPCOMING' || s === 'IN_PROGRESS';
      });
      const upcomingStarts = cohorts
        .filter((c) => cohortStatus(c) === 'UPCOMING')
        .map((c) => c.start_date)
        .sort();
      scheduleByProgramme.set(p.programme_id, {
        hasOpenCohort,
        nextCohortStart: upcomingStarts[0] ?? null,
      });

      // Completion: live programmes only, averaged across IN_PROGRESS cohorts.
      if (p.status !== 'PUBLISHED') return;
      const active = cohorts.filter((c) => cohortStatus(c) === 'IN_PROGRESS');
      if (active.length === 0) return;
      const analytics = await Promise.all(
        active.map((c) =>
          getCohortAnalytics(c.cohort_id, { includePerformance: false }),
        ),
      );
      const avgs = analytics
        .filter((a): a is NonNullable<typeof a> => a != null && a.summary.studentCount > 0)
        .map((a) => a.summary.avgCompletion);
      if (avgs.length === 0) return;
      completionByProgramme.set(
        p.programme_id,
        Math.round(avgs.reduce((acc, n) => acc + n, 0) / avgs.length),
      );
    }),
  );

  return programmes.map((p) => {
    const avg = completionByProgramme.get(p.programme_id);
    const avgCompletion = avg ?? null;
    const schedule = scheduleByProgramme.get(p.programme_id);
    return {
      ...p,
      students: studentsByProgramme.get(p.programme_id)?.size ?? 0,
      avgCompletion,
      health: avgCompletion == null ? null : avgCompletion >= 60 ? 'on-track' : 'watch',
      hasOpenCohort: schedule?.hasOpenCohort ?? false,
      nextCohortStart: schedule?.nextCohortStart ?? null,
    };
  });
}

/**
 * Lookup for the programme-scoped shell — returns identity + the
 * delivery / length / label fields that drive nav filtering (e.g.
 * SELF_PACED hides the Cohorts tab) and modal pre-fills (e.g.
 * end-date auto-fill in the cohort form uses length_units).
 *
 * RLS scopes the SELECT to tutor_id = auth.uid() (SUPER_ADMIN
 * bypass via nclex_programmes_admin_all). Returns null if the
 * programme doesn't exist OR the tutor doesn't own it; the shell
 * turns null into a 404.
 *
 * Invalid UUIDs in the URL also return null (Supabase returns an
 * error for malformed UUID input on a uuid column).
 */
import type { DeliveryMode, UnitLabel } from './types';

export type ProgrammeShellContext = {
  programme_id: string;
  title: string;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
};

export async function getProgrammeForShell(
  programmeId: string
): Promise<ProgrammeShellContext | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, delivery_mode, unit_label, length_units')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProgrammeShellContext;
}

/**
 * Focused projection for the Overview page's Publish / Archive
 * controls. Slice 9.3e — kept separate from the shell context so
 * the chrome contract stays narrow (status/timestamps are a
 * concern of one page, not every page under a programme).
 */
export type ProgrammeStatusContext = {
  programme_id: string;
  title: string;
  status: import('./types').ProgrammeStatus;
  published_at: string | null;
  archived_at: string | null;
};

export async function getProgrammeStatus(
  programmeId: string
): Promise<ProgrammeStatusContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, status, published_at, archived_at')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProgrammeStatusContext;
}
