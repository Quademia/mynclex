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
  StudentShelfMember,
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
      // Self-paced delivers the programme TEMPLATE — cohort-only rows
      // (cohort_id set) only exist under tutor-led runs and never apply
      // here. Defensive filter so they can never leak into a self-paced
      // student's view.
      .is('cohort_id', null)
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
  const [progressMap, inProgressMap, libraryState, shelfState] = await Promise.all([
    getActivityProgressMap(filteredActivities.map((a) => a.activity_id)),
    getInProgressQuizAttempts(),
    getLibraryNoteActivityState(
      supabase,
      filteredActivities
        .filter((a) => a.type === 'LIBRARY_NOTE')
        .map((a) => a.activity_id)
    ),
    getShelfActivityState(
      supabase,
      filteredActivities
        .filter((a) => a.type === 'SHELF')
        .map((a) => a.activity_id)
    ),
  ]);

  const visibleActivities: StudentActivity[] = filteredActivities.map(
    (activity) => ({
      ...activity,
      openState: 'OPEN' as const,
      releaseDate: null,
      dueDate: null,
      closeDate: null,
      // LIBRARY_NOTE + SHELF completion is DERIVED (11.11b / 11.12b),
      // never the progress engine; all other types read the progress map.
      isDone:
        activity.type === 'LIBRARY_NOTE'
          ? libraryState.doneActivityIds.has(activity.activity_id)
          : activity.type === 'SHELF'
            ? shelfState.doneActivityIds.has(activity.activity_id)
            : progressMap.has(activity.activity_id),
      isInProgress: isQuizActivityInProgress(activity, inProgressMap),
      libraryNoteId:
        libraryState.noteIdByActivity.get(activity.activity_id) ?? null,
      shelfId: shelfState.shelfIdByActivity.get(activity.activity_id) ?? null,
      shelfMembers:
        shelfState.membersByActivity.get(activity.activity_id) ?? null,
      shelfUpdate:
        shelfState.updateByActivity.get(activity.activity_id) ?? null,
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
  type StagedActivity = Omit<
    StudentActivity,
    | 'isDone'
    | 'isInProgress'
    | 'libraryNoteId'
    | 'shelfId'
    | 'shelfMembers'
    | 'shelfUpdate'
  >;
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
  const [progressMap, inProgressMap, libraryState, shelfState] = await Promise.all([
    getActivityProgressMap(staged.map((a) => a.activity_id)),
    getInProgressQuizAttempts(),
    getLibraryNoteActivityState(
      supabase,
      staged.filter((a) => a.type === 'LIBRARY_NOTE').map((a) => a.activity_id)
    ),
    getShelfActivityState(
      supabase,
      staged.filter((a) => a.type === 'SHELF').map((a) => a.activity_id)
    ),
  ]);

  const visibleActivities: StudentActivity[] = staged.map((a) => ({
    ...a,
    isDone:
      a.type === 'LIBRARY_NOTE'
        ? libraryState.doneActivityIds.has(a.activity_id)
        : a.type === 'SHELF'
          ? shelfState.doneActivityIds.has(a.activity_id)
          : progressMap.has(a.activity_id),
    isInProgress: isQuizActivityInProgress(a, inProgressMap),
    libraryNoteId: libraryState.noteIdByActivity.get(a.activity_id) ?? null,
    shelfId: shelfState.shelfIdByActivity.get(a.activity_id) ?? null,
    shelfMembers: shelfState.membersByActivity.get(a.activity_id) ?? null,
    shelfUpdate: shelfState.updateByActivity.get(a.activity_id) ?? null,
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
 * Slice 11.11a/b — for a set of LIBRARY_NOTE activity ids, resolve both:
 *   • noteIdByActivity — activity_id → the note it points to (from the
 *     linked attachment row), so the viewer can link the read view.
 *   • doneActivityIds  — activity_ids whose note the student has marked
 *     done (DERIVED from nclex_library_note_state.marked_done_at — these
 *     activities never get a progress-engine row; "done" lives once on
 *     the note's reading state). This is the 11.11b progress fold-in.
 *
 * Two RLS-scoped reads (attachments, then note_state). Empty input → no
 * queries.
 */
async function getLibraryNoteActivityState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  activityIds: string[]
): Promise<{
  noteIdByActivity: Map<string, string>;
  doneActivityIds: Set<string>;
}> {
  const noteIdByActivity = new Map<string, string>();
  const doneActivityIds = new Set<string>();
  if (activityIds.length === 0) return { noteIdByActivity, doneActivityIds };

  const { data: atts } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .select('activity_id, note_id')
    .in('activity_id', activityIds);
  for (const r of (atts ?? []) as Array<{
    activity_id: string;
    note_id: string | null;
  }>) {
    if (r.note_id) noteIdByActivity.set(r.activity_id, r.note_id);
  }

  const noteIds = [...noteIdByActivity.values()];
  if (noteIds.length === 0) return { noteIdByActivity, doneActivityIds };

  const { data: states } = await supabase
    .from('nclex_library_note_state')
    .select('note_id, marked_done_at')
    .in('note_id', noteIds);
  const doneNotes = new Set<string>();
  for (const s of (states ?? []) as Array<{
    note_id: string;
    marked_done_at: string | null;
  }>) {
    if (s.marked_done_at != null) doneNotes.add(s.note_id);
  }
  for (const [activityId, noteId] of noteIdByActivity) {
    if (doneNotes.has(noteId)) doneActivityIds.add(activityId);
  }

  return { noteIdByActivity, doneActivityIds };
}

/**
 * Slice 11.12b — for a set of SHELF activity ids, resolve their LIVE,
 * student-visible member notes (each with the student's derived done
 * state) plus the rollup completion. Returns:
 *   • shelfIdByActivity — activity_id -> the shelf it points to (for the
 *     "Go to shelf" link).
 *   • membersByActivity — activity_id -> ordered visible members with
 *     isDone. Visibility is enforced by RLS on the membership/note rows
 *     (nclex_student_can_see_note: published + enrolled-tutor-programme),
 *     and skipped notes (the attachment's skipped_note_ids) are dropped
 *     here. So a member reaching the viewer is published + visible +
 *     not-skipped.
 *   • doneActivityIds — shelves that roll up to DONE (≥1 visible member
 *     AND every visible member marked done). An empty shelf is NOT done.
 *
 * Three RLS-scoped reads: attachments (shelf_id + skipped_note_ids),
 * memberships→notes (RLS filters to visible), then the student's
 * note_state. Empty input -> no queries.
 */
async function getShelfActivityState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  activityIds: string[]
): Promise<{
  shelfIdByActivity: Map<string, string>;
  membersByActivity: Map<string, StudentShelfMember[]>;
  doneActivityIds: Set<string>;
  updateByActivity: Map<string, { added: number; removed: number }>;
}> {
  const shelfIdByActivity = new Map<string, string>();
  const membersByActivity = new Map<string, StudentShelfMember[]>();
  const doneActivityIds = new Set<string>();
  const updateByActivity = new Map<string, { added: number; removed: number }>();
  if (activityIds.length === 0) {
    return { shelfIdByActivity, membersByActivity, doneActivityIds, updateByActivity };
  }

  // 1. The shelf attachments — shelf_id + this placement's skip-list.
  const { data: atts } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .select('activity_id, shelf_id, skipped_note_ids')
    .in('activity_id', activityIds);

  const skippedByActivity = new Map<string, Set<string>>();
  const shelfIds: string[] = [];
  for (const r of (atts ?? []) as Array<{
    activity_id: string;
    shelf_id: string | null;
    skipped_note_ids: unknown;
  }>) {
    if (!r.shelf_id) continue;
    shelfIdByActivity.set(r.activity_id, r.shelf_id);
    shelfIds.push(r.shelf_id);
    skippedByActivity.set(r.activity_id, new Set(normalizeSkipped(r.skipped_note_ids)));
  }
  if (shelfIds.length === 0) {
    return { shelfIdByActivity, membersByActivity, doneActivityIds, updateByActivity };
  }

  // Slice 11.12c — the student's "last seen" visible-set per placement,
  // for the drift hint. A row's absence means "never opened" (no hint).
  const seenByActivity = new Map<string, Set<string>>();
  const seenActivityIds = new Set<string>();
  const { data: seenRows } = await supabase
    .from('nclex_library_shelf_seen')
    .select('activity_id, seen_note_ids')
    .in('activity_id', [...shelfIdByActivity.keys()]);
  for (const r of (seenRows ?? []) as Array<{
    activity_id: string;
    seen_note_ids: unknown;
  }>) {
    seenByActivity.set(r.activity_id, new Set(normalizeSkipped(r.seen_note_ids)));
    seenActivityIds.add(r.activity_id);
  }

  // 2. Member notes per shelf (RLS drops notes the student can't see).
  const { data: members } = await supabase
    .from('nclex_tutor_library_shelf_memberships')
    .select(
      `shelf_id, position,
       nclex_tutor_library_notes ( note_id, title, subtitle )`
    )
    .in('shelf_id', shelfIds)
    .order('position', { ascending: true });

  type MemberNote = { note_id: string; title: string; subtitle: string | null };
  const membersByShelf = new Map<string, MemberNote[]>();
  const allNoteIds = new Set<string>();
  for (const r of (members ?? []) as Array<{
    shelf_id: string;
    position: number;
    nclex_tutor_library_notes: MemberNote | MemberNote[] | null;
  }>) {
    const embed = r.nclex_tutor_library_notes;
    const note = Array.isArray(embed) ? embed[0] : embed;
    if (!note) continue; // RLS-filtered (not visible to this student)
    const list = membersByShelf.get(r.shelf_id) ?? [];
    list.push(note);
    membersByShelf.set(r.shelf_id, list);
    allNoteIds.add(note.note_id);
  }

  // 3. The student's done state across every member note.
  const doneNotes = new Set<string>();
  if (allNoteIds.size > 0) {
    const { data: states } = await supabase
      .from('nclex_library_note_state')
      .select('note_id, marked_done_at')
      .in('note_id', [...allNoteIds]);
    for (const s of (states ?? []) as Array<{
      note_id: string;
      marked_done_at: string | null;
    }>) {
      if (s.marked_done_at != null) doneNotes.add(s.note_id);
    }
  }

  // 4. Assemble per-activity member lists (drop skipped) + the rollup.
  for (const [activityId, shelfId] of shelfIdByActivity) {
    const skipped = skippedByActivity.get(activityId) ?? new Set<string>();
    const visible = (membersByShelf.get(shelfId) ?? []).filter(
      (n) => !skipped.has(n.note_id)
    );
    const list: StudentShelfMember[] = visible.map((n) => ({
      note_id: n.note_id,
      title: n.title,
      subtitle: n.subtitle,
      isDone: doneNotes.has(n.note_id),
    }));
    membersByActivity.set(activityId, list);
    if (list.length > 0 && list.every((m) => m.isDone)) {
      doneActivityIds.add(activityId);
    }

    // Drift hint — only when the student has opened this placement before
    // (a seen-row exists). added = current\seen, removed = seen\current.
    if (seenActivityIds.has(activityId)) {
      const seen = seenByActivity.get(activityId) ?? new Set<string>();
      const currentIds = new Set(visible.map((n) => n.note_id));
      let added = 0;
      for (const id of currentIds) if (!seen.has(id)) added++;
      let removed = 0;
      for (const id of seen) if (!currentIds.has(id)) removed++;
      if (added > 0 || removed > 0) {
        updateByActivity.set(activityId, { added, removed });
      }
    }
  }

  return { shelfIdByActivity, membersByActivity, doneActivityIds, updateByActivity };
}

// skipped_note_ids is JSONB; normalise (parsed array or JSON string) to
// a string[]. Mirrors the helper in shelf-activity-actions.ts.
function normalizeSkipped(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string');
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
