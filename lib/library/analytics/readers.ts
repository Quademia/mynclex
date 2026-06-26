// mynclex/lib/library/analytics/readers.ts
//
// Resolve a set of reader (student) ids → display name + cohort segment,
// for the Roster / Readers tabs (slice 11.11c, Slice 3). Student profiles
// are self-read-only under RLS, so — exactly like the enrolment roster —
// the tutor proves ownership of their programmes (RLS), then a service-
// role read fills in names + the cohort each reader belongs to.
//
// A reader's segment = their enrolment in one of THIS tutor's programmes:
// a named cohort, or "Self-paced" (cohortless enrolment, or no enrolment
// in the tutor's programmes at all — e.g. a direct library reader).

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export interface ReaderSegment {
  name: string;
  cohortId: string | null;
  cohortName: string | null; // null = self-paced / not in a cohort
}

export interface ResolvedReaders {
  byId: Map<string, ReaderSegment>;
  /** Cohorts (of the tutor's) that hold ≥1 of these readers, name-sorted. */
  cohorts: Array<{ id: string; name: string }>;
}

export async function resolveReaderSegments(
  studentIds: string[],
): Promise<ResolvedReaders> {
  const byId = new Map<string, ReaderSegment>();
  if (studentIds.length === 0) return { byId, cohorts: [] };

  const supabase = await createClient();
  const admin = createServiceRoleClient();

  // Names (service-role — students are self-read-only under RLS).
  const { data: users } = await admin
    .from('nclex_users')
    .select('id, name')
    .in('id', studentIds);
  for (const u of (users ?? []) as Array<{ id: string; name: string }>) {
    byId.set(u.id, {
      name: (u.name ?? '').trim() || 'Reader',
      cohortId: null,
      cohortName: null,
    });
  }
  for (const sid of studentIds) {
    if (!byId.has(sid)) {
      byId.set(sid, { name: 'Reader', cohortId: null, cohortName: null });
    }
  }

  // The tutor's programmes (RLS → owned only) gate which enrolments count.
  const { data: progs } = await supabase
    .from('nclex_programmes')
    .select('programme_id');
  const progIds = ((progs ?? []) as Array<{ programme_id: string }>).map(
    (p) => p.programme_id,
  );
  if (progIds.length === 0) return { byId, cohorts: [] };

  // A reader's segment = their ACTIVE cohort membership in the tutor's
  // programmes. We deliberately ignore PENDING / CANCELLED / EXPIRED rows
  // (a stale or unapproved enrolment shouldn't decide the segment) — so a
  // reader with only those, or none, falls into "Self-paced".
  const { data: enrols } = await admin
    .from('nclex_enrolments')
    .select('user_id, cohort_id, nclex_cohorts(name, start_date)')
    .in('user_id', studentIds)
    .in('programme_id', progIds)
    .eq('status', 'ENROLLED')
    .not('cohort_id', 'is', null)
    .order('enrolled_at', { ascending: true });

  const cohortMap = new Map<string, string>();
  for (const e of (enrols ?? []) as Array<{
    user_id: string;
    cohort_id: string | null;
    nclex_cohorts:
      | { name: string | null; start_date: string | null }
      | { name: string | null; start_date: string | null }[]
      | null;
  }>) {
    if (!e.cohort_id) continue;
    const seg = byId.get(e.user_id);
    if (!seg || seg.cohortId != null) continue; // first cohort wins
    const c = Array.isArray(e.nclex_cohorts)
      ? e.nclex_cohorts[0]
      : e.nclex_cohorts;
    const label = cohortLabel(c?.name ?? null, c?.start_date ?? null);
    seg.cohortId = e.cohort_id;
    seg.cohortName = label;
    cohortMap.set(e.cohort_id, label);
  }

  const cohorts = [...cohortMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { byId, cohorts };
}

/** A friendly cohort label — its name, else a month from the start date. */
function cohortLabel(name: string | null, startDate: string | null): string {
  if (name && name.trim()) return name.trim();
  if (startDate) {
    const d = new Date(`${startDate}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return `Cohort · ${d.toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      })}`;
    }
  }
  return 'Cohort';
}
