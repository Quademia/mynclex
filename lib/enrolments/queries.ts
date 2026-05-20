// mynclex/lib/enrolments/queries.ts
//
// Server-side reads for the tutor cohort roster (Slice 1b).
//
// Ownership + RLS note: the roster joins each enrolment to the
// student's nclex_users profile (name + email). But nclex_users RLS
// is self-read-only — a tutor can't SELECT another user's profile
// row through their own authed client, so an !inner join on the
// authed client would filter every roster row out. So we:
//   1. Gate ownership with the AUTHED client (RLS only returns the
//      cohort row if the caller owns its parent programme, or is a
//      SUPER_ADMIN). Null → caller 404s.
//   2. Read the roster (enrolment + joined profile) with the SERVICE
//      ROLE client, which bypasses RLS. Safe because step 1 already
//      proved the caller is entitled to this cohort's roster.
// A future RLS helper ("tutor may read profiles of students enrolled
// in their programmes") could replace step 2 — left for later.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { EnrolmentRosterRow, EnrolmentStatus } from './types';

// Active statuses win over terminal ones when a student has both a past
// (e.g. CANCELLED) and a current row for the same scope. Mirrors the
// same rule in lib/programmes/student-actions.ts (the switcher).
const ACTIVE_STATUSES: ReadonlySet<EnrolmentStatus> = new Set([
  'PENDING_APPROVAL',
  'ENROLLED',
  'PAUSED',
]);

function pickStatus(
  rows: { status: EnrolmentStatus }[],
): EnrolmentStatus | null {
  let chosen: EnrolmentStatus | null = null;
  for (const r of rows) {
    if (
      !chosen ||
      (ACTIVE_STATUSES.has(r.status) && !ACTIVE_STATUSES.has(chosen))
    ) {
      chosen = r.status;
    }
  }
  return chosen;
}

/**
 * The calling student's own enrolment status for a SELF-PACED
 * programme (cohort_id IS NULL), active-wins-over-terminal.
 * null = no enrolment row at all. RLS scopes to user_id = auth.uid(),
 * so this only ever sees the caller's rows.
 */
export async function getMyProgrammeEnrolmentStatus(
  programmeId: string,
): Promise<EnrolmentStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_enrolments')
    .select('status')
    .eq('programme_id', programmeId)
    .is('cohort_id', null);
  return pickStatus((data ?? []) as { status: EnrolmentStatus }[]);
}

/**
 * The calling student's own enrolment status for a tutor-led COHORT,
 * active-wins-over-terminal. null = no enrolment row.
 */
export async function getMyCohortEnrolmentStatus(
  cohortId: string,
): Promise<EnrolmentStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_enrolments')
    .select('status')
    .eq('cohort_id', cohortId);
  return pickStatus((data ?? []) as { status: EnrolmentStatus }[]);
}

export async function getCohortRoster(
  cohortId: string,
): Promise<EnrolmentRosterRow[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Ownership gate (RLS-scoped). Returns the row only for the owning
  // tutor or a SUPER_ADMIN; anyone else gets null.
  const { data: owned } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!owned) return null;

  // Roster read via service role (student profiles are self-read-only
  // under RLS). Ownership already proven above.
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('nclex_enrolments')
    // nclex_enrolments has three FKs to nclex_users (user_id,
    // enrolled_by_user_id, approved_by_user_id), so the embed MUST name
    // the constraint — an unqualified nclex_users!inner is ambiguous and
    // PostgREST errors (which this function would swallow into an empty
    // roster). Follow the user_id FK explicitly.
    .select(
      `enrolment_id, user_id, status, enrolment_source, enrolled_at,
       nclex_users!nclex_enrolments_user_id_fkey!inner(name, email)`,
    )
    .eq('cohort_id', cohortId)
    .order('enrolled_at', { ascending: false });

  if (error || !data) return [];

  type RawRow = {
    enrolment_id: string;
    user_id: string;
    status: EnrolmentRosterRow['status'];
    enrolment_source: EnrolmentRosterRow['enrolment_source'];
    enrolled_at: string;
    nclex_users:
      | { name: string; email: string }
      | { name: string; email: string }[]
      | null;
  };

  return (data as RawRow[])
    .map((r) => {
      const profile = Array.isArray(r.nclex_users)
        ? r.nclex_users[0]
        : r.nclex_users;
      if (!profile) return null;
      return {
        enrolment_id: r.enrolment_id,
        user_id: r.user_id,
        status: r.status,
        enrolment_source: r.enrolment_source,
        enrolled_at: r.enrolled_at,
        name: profile.name,
        email: profile.email,
      } satisfies EnrolmentRosterRow;
    })
    .filter((r): r is EnrolmentRosterRow => r !== null);
}
