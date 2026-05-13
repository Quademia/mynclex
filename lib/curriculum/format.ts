// mynclex/lib/curriculum/format.ts
//
// Display helpers for the curriculum surfaces. Holds the
// `unitLabel(programme)` helper — the single source of truth for
// rendering "Week N" / "Module N" anywhere the curriculum surfaces
// it (unit cards, unit detail topbar, calendar, student dashboard,
// history). Per the 2026-05-11 architecture rework: same DB layer
// either way; only the rendered label changes.

import type {
  ProgrammeStatus,
  UnitLabel,
} from '@/lib/programmes/types';
import type {
  ActivityPayloadMock,
  ActivityPayloadPracticeQuiz,
} from './types';

/**
 * Render a unit number with the programme's chosen label, e.g.
 * "Week 3" or "Module 3". Single source of truth — call this
 * everywhere the curriculum names a unit.
 */
export function unitLabel(
  unitIndex: number,
  label: UnitLabel
): string {
  const noun = label === 'WEEK' ? 'Week' : 'Module';
  return `${noun} ${unitIndex}`;
}

/**
 * Compact meta line for the unit card — "0 blocks · 0 activities".
 * Plural-aware. Always renders both counts, even when zero, so
 * empty units make their shape visible.
 */
export function formatUnitCounts(
  blockCount: number,
  activityCount: number
): string {
  const blocks = `${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}`;
  const activities = `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`;
  return `${blocks} · ${activities}`;
}

/**
 * Display title for a unit card. Falls back to the unit-label
 * default when the tutor hasn't set a custom title yet (most units
 * on day one).
 */
export function formatUnitTitle(
  unit: { title: string | null; unit_index: number },
  label: UnitLabel
): string {
  const trimmed = unit.title?.trim();
  if (trimmed && trimmed.length > 0) return trimmed;
  return unitLabel(unit.unit_index, label);
}

/**
 * Status pill copy + CSS class. Mirrors the programme pill pattern
 * but uses the Live/Draft binary at the unit/block/activity layer.
 */
export function unitStatusLabel(isPublished: boolean): string {
  return isPublished ? 'Live' : 'Draft';
}

export function unitStatusPillClass(isPublished: boolean): string {
  return isPublished ? 'is-live' : 'is-draft';
}

/**
 * Slice 9.3d-d — is this Mock / Practice-quiz activity wired to a
 * tutor quiz yet? Render-time derivation from the payload's
 * `quiz_id`. The placeholder editors and the (future) cohort
 * checklist both ask this question; storing the flag separately
 * would invite drift.
 */
export function isQuizLinked(
  payload: ActivityPayloadMock | ActivityPayloadPracticeQuiz
): boolean {
  return typeof payload.quiz_id === 'string' && payload.quiz_id.length > 0;
}

/**
 * Slice 9.3e — second meta line on the unit card. Shows how many
 * of the unit's children are Live vs total. Skips parts whose
 * total is zero (an empty unit doesn't say "0 of 0 activities
 * live"). Returns null when the unit has neither blocks nor
 * activities — caller skips the line entirely.
 */
export function formatPublishedCounts(
  publishedBlocks: number,
  totalBlocks: number,
  publishedActivities: number,
  totalActivities: number
): string | null {
  const parts: string[] = [];
  if (totalActivities > 0) {
    const noun = totalActivities === 1 ? 'activity' : 'activities';
    parts.push(`${publishedActivities} of ${totalActivities} ${noun} live`);
  }
  if (totalBlocks > 0) {
    const noun = totalBlocks === 1 ? 'block' : 'blocks';
    parts.push(`${publishedBlocks} of ${totalBlocks} ${noun} live`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * Slice 9.3e — single visibility predicate. AND-chains the four
 * publish flags the curriculum tree carries:
 *   1. programme.status === 'PUBLISHED'
 *   2. unit.is_published
 *   3. block.is_published (only when the activity sits in a block;
 *      loose activities skip this check)
 *   4. activity.is_published
 *
 * This is the source of truth for "does a student see this row in
 * a cohort checklist?". 9.3e ships it as a helper; 9.3f's cohort-
 * checklist query is the first real caller. The student-facing
 * runtime calls it again at render time as defence-in-depth (RLS
 * stays the ultimate gate at the DB layer).
 */
export function isVisibleToStudents(input: {
  programmeStatus: ProgrammeStatus;
  unitPublished: boolean;
  blockPublished: boolean | null;  // null = loose activity (no block)
  activityPublished: boolean;
}): boolean {
  return (
    input.programmeStatus === 'PUBLISHED' &&
    input.unitPublished &&
    (input.blockPublished === null || input.blockPublished) &&
    input.activityPublished
  );
}
