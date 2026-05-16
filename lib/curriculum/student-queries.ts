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
//   joined to activities → filtered by isVisibleToStudents()
//   (publish + inclusion gates). Release/close-gated activities
//   are NOT dropped — they ride along as StudentActivity rows;
//   their window dates feed activityOpenState() (slice 10.6 /
//   10.7), which the viewer renders as LOCKED / OPEN / CLOSED.
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
import { isVisibleToStudents, activityOpenState } from './format';
import {
  getActivityProgressMap,
  getInProgressQuizAttempts,
} from '@/lib/progress/queries';
import type {
  ActivityProgressMap,
  InProgressQuizMap,
} from '@/lib/progress/types';
import type {
  ProgrammeActivity,
  ProgrammeBlock,
  ProgrammeUnit,
  StudentActivity,
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
  // cohort args), then wrap as StudentActivity. Self-paced has no
  // window — every visible activity is permanently OPEN.
  const filteredActivities = activities.filter((a) =>
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

  // Progress engine — fetch progress rows + IN_PROGRESS quiz
  // attempts in parallel (both scoped by RLS to auth.uid()'s own
  // rows). Slice 1 added the progress map; Slice 3 added the
  // IN_PROGRESS derivation.
  const [progressMap, inProgressMap] = await Promise.all([
    getActivityProgressMap(filteredActivities.map((a) => a.activity_id)),
    getInProgressQuizAttempts(),
  ]);

  const visibleActivities: StudentActivity[] = filteredActivities.map(
    (activity) => ({
      ...activity,
      openState: 'OPEN' as const,
      releaseDate: null,
      dueDate: null,
      closeDate: null,
      isDone: progressMap.has(activity.activity_id),
      isInProgress: isQuizActivityInProgress(activity, inProgressMap),
    })
  );

  const unitTrees = composeUnitTrees(units, blocks, visibleActivities);
  const decoratedUnits = decorateUnitsWithProgress(unitTrees);
  const { upNextActivityId, whereILeftOffUnitIndex, hasAnyDone } =
    deriveProgrammeSignals(decoratedUnits, progressMap, inProgressMap);

  return {
    programme: {
      programme_id: prog.programme_id,
      title: prog.title,
      delivery_mode: prog.delivery_mode as DeliveryMode,
      unit_label: prog.unit_label as UnitLabel,
    },
    cohort: null,
    units: decoratedUnits,
    upNextActivityId,
    whereILeftOffUnitIndex,
    hasAnyDone,
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
        `is_included, release_date, due_date, close_date,
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
    due_date: string | null;
    close_date: string | null;
    nclex_programme_activities: ProgrammeActivity | ProgrammeActivity[];
  };
  const rawRows = (rowsRes.data ?? []) as RawRow[];

  // Apply the student visibility filter at the row level. Publish
  // + inclusion gates HIDE an activity (dropped here). The release
  // date does NOT hide — visible-but-unreleased activities stay in
  // the tree as locked StudentActivity rows (slice 10.6).
  //
  // Two-pass: first build the visible-list shaped without progress
  // signals, then fetch progress + IN_PROGRESS for those ids in
  // parallel and attach.
  type StagedActivity = Omit<StudentActivity, 'isDone' | 'isInProgress'>;
  const staged: StagedActivity[] = [];
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
      !isVisibleToStudents({
        programmeStatus: 'PUBLISHED',
        unitPublished,
        blockPublished,
        activityPublished: activity.is_published,
        cohortIncluded: r.is_included,
      })
    ) {
      continue;
    }

    staged.push({
      ...activity,
      openState: activityOpenState(r.release_date, r.close_date, today),
      releaseDate: r.release_date,
      dueDate: r.due_date,
      closeDate: r.close_date,
    });
  }

  // Progress engine — fetch progress + IN_PROGRESS map in parallel.
  // Same shape as self-paced; cohort mode reads the same progress
  // table (row attaches to template activity, not cohort).
  const [progressMap, inProgressMap] = await Promise.all([
    getActivityProgressMap(staged.map((a) => a.activity_id)),
    getInProgressQuizAttempts(),
  ]);

  const visibleActivities: StudentActivity[] = staged.map((a) => ({
    ...a,
    isDone: progressMap.has(a.activity_id),
    isInProgress: isQuizActivityInProgress(a, inProgressMap),
  }));

  const unitTrees = composeUnitTrees(units, blocks, visibleActivities);
  const decoratedUnits = decorateUnitsWithProgress(unitTrees);
  const { upNextActivityId, whereILeftOffUnitIndex, hasAnyDone } =
    deriveProgrammeSignals(decoratedUnits, progressMap, inProgressMap);

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
    units: decoratedUnits,
    upNextActivityId,
    whereILeftOffUnitIndex,
    hasAnyDone,
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
  visibleActivities: StudentActivity[]
): StudentCurriculumUnit[] {
  const blocksByUnit = new Map<string, ProgrammeBlock[]>();
  for (const b of blocks) {
    const arr = blocksByUnit.get(b.unit_id) ?? [];
    arr.push(b);
    blocksByUnit.set(b.unit_id, arr);
  }

  const activitiesByUnit = new Map<string, StudentActivity[]>();
  for (const a of visibleActivities) {
    const arr = activitiesByUnit.get(a.unit_id) ?? [];
    arr.push(a);
    activitiesByUnit.set(a.unit_id, arr);
  }

  return units.map((unit) => {
    const unitBlocks = blocksByUnit.get(unit.unit_id) ?? [];
    const unitActivities = activitiesByUnit.get(unit.unit_id) ?? [];

    // Split visible activities into loose vs in-block.
    const looseActivities: StudentActivity[] = [];
    const activitiesByBlock = new Map<string, StudentActivity[]>();
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
      | { kind: 'loose'; ordinal: number; activity: StudentActivity };
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

    // Progress counts are stubbed here and overwritten by
    // decorateUnitsWithProgress — this composer doesn't know about
    // progress.
    return {
      unit,
      body,
      progressDone: 0,
      progressTotal: 0,
      progressPct: null,
    };
  });
}

// ─────────────────────────────────────────────────────────
// Progress decoration (Slice 3)
// ─────────────────────────────────────────────────────────

/**
 * Quiz activity types that can have an IN_PROGRESS attempt against
 * them. Other types (TEXT, PDF, etc.) never have IN_PROGRESS — the
 * MANUAL completion source is binary NOT_STARTED → DONE.
 */
const QUIZ_TYPES = new Set(['MOCK', 'PRACTICE_QUIZ']);

function isQuizActivityInProgress(
  activity: ProgrammeActivity,
  inProgressMap: InProgressQuizMap
): boolean {
  if (!QUIZ_TYPES.has(activity.type)) return false;
  return inProgressMap.has(activity.activity_id);
}

/**
 * Flatten a unit's body to its activity list (loose + within-block,
 * preserving display order). Shared helper for the per-unit count +
 * the programme-wide finders.
 */
function flattenUnitActivities(
  unit: StudentCurriculumUnit
): StudentActivity[] {
  const out: StudentActivity[] = [];
  for (const entry of unit.body) {
    if (entry.kind === 'block') {
      out.push(...entry.activities);
    } else {
      out.push(entry.activity);
    }
  }
  return out;
}

/**
 * Per-unit progress counts. Total = visible activities in unit;
 * LOCKED / CLOSED count toward the denominator per §7 — they're
 * part of the curriculum, just inaccessible right now. Pct rounded
 * to integer; null when total = 0.
 */
function decorateUnitsWithProgress(
  units: StudentCurriculumUnit[]
): StudentCurriculumUnit[] {
  return units.map((u) => {
    const activities = flattenUnitActivities(u);
    const total = activities.length;
    const done = activities.filter((a) => a.isDone).length;
    const pct = total === 0 ? null : Math.round((done / total) * 100);
    return { ...u, progressDone: done, progressTotal: total, progressPct: pct };
  });
}

/**
 * Programme-wide signals derived after units are composed:
 * - upNextActivityId — first row in curriculum order that's
 *   NOT_STARTED AND NOT IN_PROGRESS AND OPEN. Skips quiz rows with
 *   an IN_PROGRESS attempt (they have their own pill, per the
 *   Slice 3 pill cascade). LOCKED/CLOSED rows skipped too — Up
 *   next is a "do this now" pointer.
 * - whereILeftOffUnitIndex — most recent IN_PROGRESS quiz
 *   attempt's unit (per §6.1's resume-first rule), fallback to
 *   most recent DONE activity's unit, fallback to null (viewer
 *   defaults to Unit 1).
 * - hasAnyDone — drives the "Start here" vs "Up next" copy flip.
 */
function deriveProgrammeSignals(
  units: StudentCurriculumUnit[],
  progressMap: ActivityProgressMap,
  inProgressMap: InProgressQuizMap
): {
  upNextActivityId: string | null;
  whereILeftOffUnitIndex: number | null;
  hasAnyDone: boolean;
} {
  let upNextActivityId: string | null = null;
  let mostRecentInProgressTs: string | null = null;
  let mostRecentInProgressUnitIndex: number | null = null;
  let mostRecentDoneTs: string | null = null;
  let mostRecentDoneUnitIndex: number | null = null;
  let hasAnyDone = false;

  for (const u of units) {
    const activities = flattenUnitActivities(u);
    for (const a of activities) {
      if (a.isDone) {
        hasAnyDone = true;
        const ts = progressMap.get(a.activity_id)?.completed_at;
        if (ts && (!mostRecentDoneTs || ts > mostRecentDoneTs)) {
          mostRecentDoneTs = ts;
          mostRecentDoneUnitIndex = u.unit.unit_index;
        }
      } else if (a.isInProgress) {
        const ts = inProgressMap.get(a.activity_id);
        if (ts && (!mostRecentInProgressTs || ts > mostRecentInProgressTs)) {
          mostRecentInProgressTs = ts;
          mostRecentInProgressUnitIndex = u.unit.unit_index;
        }
      } else if (a.openState === 'OPEN' && upNextActivityId === null) {
        // First NOT_STARTED-and-not-in-progress OPEN row in
        // curriculum order — this is the Up next target.
        upNextActivityId = a.activity_id;
      }
    }
  }

  const whereILeftOffUnitIndex =
    mostRecentInProgressUnitIndex ?? mostRecentDoneUnitIndex ?? null;

  return { upNextActivityId, whereILeftOffUnitIndex, hasAnyDone };
}
