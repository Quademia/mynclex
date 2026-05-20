// mynclex/lib/programmes/student-actions.ts
//
// Slice 10.1 — server action that backs the
// <ProgrammeSwitcherOverlay>. Returns the student's accessible
// programmes + cohorts, lazily fetched when the overlay opens.
//
// Permissive v1: RLS exposes every PUBLISHED programme to any
// authenticated student (slice 10.1 *_student_select policies).
// When the enrolment slice ships, the query body adds an
// EXISTS on the enrolment table AND the RLS USING clause
// tightens — both layers move together. The shape returned to
// the overlay does not change.

'use server';

import { requireStudent } from '@/lib/access';
import type { EnrolmentStatus } from '@/lib/enrolments/types';
import type { DeliveryMode, UnitLabel } from './types';

export type SwitcherProgramme = {
  programme_id: string;
  title: string;
  tagline: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  cohorts: SwitcherCohort[];
  // Self-paced only: the student's enrolment status on this programme
  // (cohort_id IS NULL). null = listed but not enrolled (v1 permissive).
  status: EnrolmentStatus | null;
};

export type SwitcherCohort = {
  cohort_id: string;
  programme_id: string;
  name: string | null;
  start_date: string;
  end_date: string;
  // The student's enrolment status in this cohort, or null if they're
  // not enrolled (the cohort is still listed under permissive v1).
  status: EnrolmentStatus | null;
};

// Active statuses win over terminal ones when a student has both a
// past (e.g. CANCELLED) and a current row for the same cohort.
const ACTIVE_STATUSES: ReadonlySet<EnrolmentStatus> = new Set([
  'PENDING_APPROVAL',
  'ENROLLED',
  'PAUSED',
]);

export async function getMyAccessibleProgrammesAction(): Promise<{
  programmes: SwitcherProgramme[];
}> {
  const ctx = await requireStudent();
  const supabase = ctx.supabase;

  const [progRes, cohortRes, enrolRes] = await Promise.all([
    supabase
      .from('nclex_programmes')
      .select(
        'programme_id, title, tagline, delivery_mode, unit_label, length_units'
      )
      .order('title', { ascending: true }),
    supabase
      .from('nclex_cohorts')
      .select('cohort_id, programme_id, name, start_date, end_date')
      .order('start_date', { ascending: true }),
    // The student's own enrolment rows (RLS: user_id = auth.uid()).
    supabase
      .from('nclex_enrolments')
      .select('programme_id, cohort_id, status'),
  ]);

  const programmes = (progRes.data ?? []) as Omit<
    SwitcherProgramme,
    'cohorts' | 'status'
  >[];
  const cohorts = (cohortRes.data ?? []) as Omit<SwitcherCohort, 'status'>[];
  const enrolments = (enrolRes.data ?? []) as {
    programme_id: string;
    cohort_id: string | null;
    status: EnrolmentStatus;
  }[];

  // Status lookup keyed by cohort_id (tutor-led) or "prog:<id>" for
  // self-paced (cohort_id IS NULL). Active status wins over terminal.
  const statusByKey = new Map<string, EnrolmentStatus>();
  for (const e of enrolments) {
    const key = e.cohort_id ?? `prog:${e.programme_id}`;
    const existing = statusByKey.get(key);
    if (!existing || (ACTIVE_STATUSES.has(e.status) && !ACTIVE_STATUSES.has(existing))) {
      statusByKey.set(key, e.status);
    }
  }

  const cohortsByProgramme = new Map<string, SwitcherCohort[]>();
  for (const c of cohorts) {
    const arr = cohortsByProgramme.get(c.programme_id) ?? [];
    arr.push({ ...c, status: statusByKey.get(c.cohort_id) ?? null });
    cohortsByProgramme.set(c.programme_id, arr);
  }

  return {
    programmes: programmes.map((p) => ({
      ...p,
      cohorts: cohortsByProgramme.get(p.programme_id) ?? [],
      status: statusByKey.get(`prog:${p.programme_id}`) ?? null,
    })),
  };
}
