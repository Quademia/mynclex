// mynclex/lib/curriculum/student-queries.ts
//
// Slice 10.1 — fetches the student-facing curriculum tree for
// both delivery modes. Two entry points, one shared output type
// (`StudentCurriculumTree` in ./types). The viewer doesn't care
// which mode produced the tree — it just renders it.
//
// Self-paced reads the programme template directly:
//   programme + units + blocks + activities → filtered by
//   isVisibleToStudents() with no cohort context.
//
// Tutor-led routes every activity through the cohort checklist:
//   cohort + parent programme + units + blocks + checklist rows
//   joined to activities → filtered by isVisibleToStudents() with
//   cohort context (is_included + release_date).
//
// RLS is the security floor — students can only SELECT under a
// PUBLISHED programme (slice 10.1 *_student_select policies).
// This query layer adds the per-row TS render filter (unit /
// block / activity is_published, plus the cohort half for tutor-
// led). The two layers mirror each other; either alone would
// over-show.
//
// Returns null when the programme/cohort doesn't exist or isn't
// readable — pages turn null into notFound() / 404 (same
// response either way so DRAFT existence doesn't leak).

import { createClient } from '@/lib/supabase/server';
import { isVisibleToStudents } from './format';
import type {
  ProgrammeActivity,
  ProgrammeBlock,
  ProgrammeUnit,
  StudentBodyEntry,
  StudentCurriculumTree,
  StudentCurriculumUnit,
} from './types';
import type { DeliveryMode, UnitLabel } from '@/lib/programmes/types';

// ─────────────────────────────────────────────────────────
// Self-paced
// ─────────────────────────────────────────────────────────

export async function getStudentSelfPacedCurriculum(
  programmeId: string
): Promise<StudentCurriculumTree | null> {
  const supabase = await createClient();

  // Wave 1 — programme identity. RLS filters out non-PUBLISHED.
  const { data: prog, error: progError } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, delivery_mode, unit_label')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (progError || !prog) return null;

  // Wave 2 — units + blocks + activities (three parallel reads).
  const [unitsRes, blocksRes, activitiesRes] = await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select(
        `unit_id, programme_id, unit_index, title, description,
         is_published, created_at, updated_at`
      )
      .eq('programme_id', programmeId)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_blocks')
      .select(
        `block_id, unit_id, ordinal, title, description, is_published,
         created_at, updated_at,
         nclex_programme_units!inner(programme_id)`
      )
      .eq('nclex_programme_units.programme_id', programmeId)
      .order('ordinal', { ascending: true }),
    supabase
      .from('nclex_programme_activities')
      .select(
        `activity_id, unit_id, block_id, ordinal, type, title,
         description, note, payload, is_published,
         created_at, updated_at,
         nclex_programme_units!inner(programme_id)`
      )
      .eq('nclex_programme_units.programme_id', programmeId)
      .order('ordinal', { ascending: true }),
  ]);

  const units = (unitsRes.data ?? []) as ProgrammeUnit[];
  const blocks = (blocksRes.data ?? []).map(stripUnitEmbed) as ProgrammeBlock[];
  const activities = (activitiesRes.data ?? []).map(
    stripUnitEmbed
  ) as ProgrammeActivity[];

  // Filter activities by isVisibleToStudents (self-paced — no
  // cohort args). Then compose into the unit→body shape.
  const visibleActivities = activities.filter((a) =>
    isVisibleToStudents({
      programmeStatus: 'PUBLISHED',
      unitPublished:
        units.find((u) => u.unit_id === a.unit_id)?.is_published ?? false,
      blockPublished:
        a.block_id === null
          ? null
          : blocks.find((b) => b.block_id === a.block_id)?.is_published ??
            false,
      activityPublished: a.is_published,
    })
  );

  const unitTrees = composeUnitTrees(units, blocks, visibleActivities);

  return {
    programme: {
      programme_id: prog.programme_id,
      title: prog.title,
      delivery_mode: prog.delivery_mode as DeliveryMode,
      unit_label: prog.unit_label as UnitLabel,
    },
    cohort: null,
    units: unitTrees,
  };
}

// ─────────────────────────────────────────────────────────
// Tutor-led (cohort-scoped)
// ─────────────────────────────────────────────────────────

export async function getStudentCohortCurriculum(
  cohortId: string,
  today?: string
): Promise<StudentCurriculumTree | null> {
  const supabase = await createClient();

  // Wave 1 — cohort + parent programme. RLS filters out cohorts
  // whose parent programme isn't PUBLISHED.
  const { data: cohortRow, error: cohortError } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, name, start_date,
       nclex_programmes!inner(
         programme_id, title, delivery_mode, unit_label
       )`
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();

  if (cohortError || !cohortRow) return null;

  const programmeRaw = (cohortRow as typeof cohortRow & {
    nclex_programmes:
      | { programme_id: string; title: string; delivery_mode: DeliveryMode; unit_label: UnitLabel }
      | Array<{ programme_id: string; title: string; delivery_mode: DeliveryMode; unit_label: UnitLabel }>
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(programmeRaw) ? programmeRaw[0] : programmeRaw;
  if (!programme) return null;

  // Wave 2 — units, blocks, and checklist rows joined to their
  // template activities. Three parallel reads, mirroring the
  // tutor-side getCohortChecklist() shape.
  const [unitsRes, blocksRes, rowsRes] = await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select(
        `unit_id, programme_id, unit_index, title, description,
         is_published, created_at, updated_at`
      )
      .eq('programme_id', programme.programme_id)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_blocks')
      .select(
        `block_id, unit_id, ordinal, title, description, is_published,
         created_at, updated_at,
         nclex_programme_units!inner(programme_id)`
      )
      .eq('nclex_programme_units.programme_id', programme.programme_id)
      .order('ordinal', { ascending: true }),
    supabase
      .from('nclex_cohort_checklist_items')
      .select(
        `is_included, release_date,
         nclex_programme_activities!inner(
           activity_id, unit_id, block_id, ordinal, type, title,
           description, note, payload, is_published, created_at, updated_at
         )`
      )
      .eq('cohort_id', cohortId),
  ]);

  const units = (unitsRes.data ?? []) as ProgrammeUnit[];
  const blocks = (blocksRes.data ?? []).map(stripUnitEmbed) as ProgrammeBlock[];

  // Normalise the embed shape (PostgREST returns object | array).
  type RawRow = {
    is_included: boolean;
    release_date: string;
    nclex_programme_activities: ProgrammeActivity | ProgrammeActivity[];
  };
  const rawRows = (rowsRes.data ?? []) as RawRow[];

  // Apply student visibility filter at the row level — drop rows
  // where the predicate says no. Reduces the activity list down
  // to what the student should see.
  const visibleActivities: ProgrammeActivity[] = [];
  for (const r of rawRows) {
    const activity = Array.isArray(r.nclex_programme_activities)
      ? r.nclex_programme_activities[0]
      : r.nclex_programme_activities;
    if (!activity) continue;

    const unitPublished =
      units.find((u) => u.unit_id === activity.unit_id)?.is_published ?? false;
    const blockPublished =
      activity.block_id === null
        ? null
        : blocks.find((b) => b.block_id === activity.block_id)?.is_published ??
          false;

    if (
      isVisibleToStudents({
        programmeStatus: 'PUBLISHED',
        unitPublished,
        blockPublished,
        activityPublished: activity.is_published,
        cohortIncluded: r.is_included,
        releaseDate: r.release_date,
        today,
      })
    ) {
      visibleActivities.push(activity);
    }
  }

  const unitTrees = composeUnitTrees(units, blocks, visibleActivities);

  return {
    programme: {
      programme_id: programme.programme_id,
      title: programme.title,
      delivery_mode: programme.delivery_mode,
      unit_label: programme.unit_label,
    },
    cohort: {
      cohort_id: cohortRow.cohort_id,
      name: cohortRow.name,
      start_date: cohortRow.start_date,
    },
    units: unitTrees,
  };
}

// ─────────────────────────────────────────────────────────
// Shared composers
// ─────────────────────────────────────────────────────────

/**
 * Strip the PostgREST inner-join embed before returning rows.
 * The `nclex_programme_units` key exists only to scope the query
 * via the join; it's not part of the surface type.
 */
function stripUnitEmbed<T extends { nclex_programme_units?: unknown }>(
  row: T
): Omit<T, 'nclex_programme_units'> {
  const { nclex_programme_units: _, ...rest } = row;
  return rest;
}

/**
 * Compose units + blocks + visible activities into the student
 * unit→body tree. Mirrors composeUnitBody() on the tutor side but
 * carries activities pre-filtered.
 *
 * Empty units (no visible activities AND no visible blocks)
 * survive the composition — the viewer renders them as "no
 * content yet" cards. Same for empty blocks within a unit.
 * Reason: the tutor's structural intent (week 2 exists; module
 * 5 is in the syllabus) is part of what a student sees, even
 * when the body is empty.
 */
function composeUnitTrees(
  units: ProgrammeUnit[],
  blocks: ProgrammeBlock[],
  visibleActivities: ProgrammeActivity[]
): StudentCurriculumUnit[] {
  const blocksByUnit = new Map<string, ProgrammeBlock[]>();
  for (const b of blocks) {
    const arr = blocksByUnit.get(b.unit_id) ?? [];
    arr.push(b);
    blocksByUnit.set(b.unit_id, arr);
  }

  const activitiesByUnit = new Map<string, ProgrammeActivity[]>();
  for (const a of visibleActivities) {
    const arr = activitiesByUnit.get(a.unit_id) ?? [];
    arr.push(a);
    activitiesByUnit.set(a.unit_id, arr);
  }

  return units.map((unit) => {
    const unitBlocks = blocksByUnit.get(unit.unit_id) ?? [];
    const unitActivities = activitiesByUnit.get(unit.unit_id) ?? [];

    // Split visible activities into loose vs in-block.
    const looseActivities: ProgrammeActivity[] = [];
    const activitiesByBlock = new Map<string, ProgrammeActivity[]>();
    for (const a of unitActivities) {
      if (a.block_id === null) {
        looseActivities.push(a);
      } else {
        const arr = activitiesByBlock.get(a.block_id) ?? [];
        arr.push(a);
        activitiesByBlock.set(a.block_id, arr);
      }
    }

    // Compose: blocks + loose activities interleaved by ordinal.
    type Sortable =
      | { kind: 'block'; ordinal: number; block: ProgrammeBlock }
      | { kind: 'loose'; ordinal: number; activity: ProgrammeActivity };
    const sortables: Sortable[] = [];
    for (const b of unitBlocks) {
      sortables.push({ kind: 'block', ordinal: b.ordinal, block: b });
    }
    for (const a of looseActivities) {
      sortables.push({ kind: 'loose', ordinal: a.ordinal, activity: a });
    }
    sortables.sort((a, b) => a.ordinal - b.ordinal);

    const body: StudentBodyEntry[] = sortables.map((e) => {
      if (e.kind === 'block') {
        const blockActivities = (
          activitiesByBlock.get(e.block.block_id) ?? []
        ).sort((x, y) => x.ordinal - y.ordinal);
        return { kind: 'block', block: e.block, activities: blockActivities };
      }
      return { kind: 'loose', activity: e.activity };
    });

    return { unit, body };
  });
}
