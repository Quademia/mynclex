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
import type { DeliveryMode, UnitLabel } from './types';

export type SwitcherProgramme = {
  programme_id: string;
  title: string;
  tagline: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  cohorts: SwitcherCohort[];
};

export type SwitcherCohort = {
  cohort_id: string;
  programme_id: string;
  name: string | null;
  start_date: string;
  end_date: string;
};

export async function getMyAccessibleProgrammesAction(): Promise<{
  programmes: SwitcherProgramme[];
}> {
  const ctx = await requireStudent();
  const supabase = ctx.supabase;

  const [progRes, cohortRes] = await Promise.all([
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
  ]);

  const programmes = (progRes.data ?? []) as Omit<
    SwitcherProgramme,
    'cohorts'
  >[];
  const cohorts = (cohortRes.data ?? []) as SwitcherCohort[];

  const cohortsByProgramme = new Map<string, SwitcherCohort[]>();
  for (const c of cohorts) {
    const arr = cohortsByProgramme.get(c.programme_id) ?? [];
    arr.push(c);
    cohortsByProgramme.set(c.programme_id, arr);
  }

  return {
    programmes: programmes.map((p) => ({
      ...p,
      cohorts: cohortsByProgramme.get(p.programme_id) ?? [],
    })),
  };
}
