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
  ActivityPayloadExternalLink,
  ActivityPayloadMock,
  ActivityPayloadOnlineLiveSession,
  ActivityPayloadPdf,
  ActivityPayloadPracticeQuiz,
  ActivityPayloadText,
  ActivityType,
  ProgrammeActivity,
} from './types';

/**
 * Single source of truth for the per-type activity icon. Used by
 * every curriculum surface that shows an activity — the tutor unit
 * builder, the activity picker, the cohort checklist, and the
 * student curriculum launcher. Decorative everywhere (the text
 * label beside it carries the meaning for assistive tech).
 *
 * Only the icon is shared — the text *labels* stay per-surface on
 * purpose (the tutor says "Text", the student says "Reading").
 */
export const ACTIVITY_TYPE_ICON: Record<ActivityType, string> = {
  TEXT: '📝',
  PDF: '📄',
  EXTERNAL_LINK: '🔗',
  ONLINE_LIVE_SESSION: '🎥',
  MOCK: '🎯',
  PRACTICE_QUIZ: '✏️',
  LIBRARY_NOTE: '📔',
};

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
 * "Does this activity appear in the student's curriculum at all?"
 * AND-chains the gates that genuinely HIDE an activity:
 *
 * Template-side (always checked):
 *   1. programme.status === 'PUBLISHED'
 *   2. unit.is_published
 *   3. block.is_published — null = loose activity, skipped
 *   4. activity.is_published
 *
 * Cohort-side (slice 9.3f — checked only when provided):
 *   5. cohort checklist row is included
 *
 * Self-paced programmes have no cohort layer — callers pass
 * `cohortIncluded` as null/undefined and that branch short-
 * circuits to true.
 *
 * The window-date gates (release / close) are deliberately NOT
 * here (slice 10.6 / 10.7). A future release date or a past close
 * date does not HIDE an activity — it LOCKS it: the activity stays
 * in the tree as a "🔒 Opens / Closed <date>" row. "Hidden" (draft
 * / excluded — not ready) and "locked" (scheduled — ready but
 * outside its window) are two different states. Use
 * activityOpenState() for the window question.
 *
 * RLS stays the ultimate gate at the DB layer; this predicate is
 * the app-side render filter.
 */
export function isVisibleToStudents(input: {
  programmeStatus: ProgrammeStatus;
  unitPublished: boolean;
  blockPublished: boolean | null;  // null = loose activity (no block)
  activityPublished: boolean;
  // Cohort layer — null/undefined for self-paced (no cohort).
  cohortIncluded?: boolean | null;
}): boolean {
  if (input.programmeStatus !== 'PUBLISHED') return false;
  if (!input.unitPublished) return false;
  if (input.blockPublished !== null && !input.blockPublished) return false;
  if (!input.activityPublished) return false;
  if (input.cohortIncluded != null && !input.cohortIncluded) return false;
  return true;
}

/**
 * Slice 10.6 / 10.7 — the student-facing open state of a cohort
 * activity, derived from its window dates vs. today:
 *   LOCKED  — before release_date ("Opens <date>")
 *   OPEN    — released, and either no close_date or close_date is
 *             today or later
 *   CLOSED  — past close_date ("Closed <date>")
 *
 * Self-paced activities have no window (both dates null) → always
 * OPEN. An activity stays open *through* its close_date — it goes
 * CLOSED only once close_date is strictly before today.
 *
 * `today` is exposed for testability; defaults to today (UTC) in
 * YYYY-MM-DD shape — matches the DATE columns on the checklist.
 */
export function activityOpenState(
  releaseDate: string | null | undefined,
  closeDate: string | null | undefined,
  today?: string
): 'LOCKED' | 'OPEN' | 'CLOSED' {
  const t = today ?? new Date().toISOString().slice(0, 10);
  if (releaseDate != null && releaseDate > t) return 'LOCKED';
  if (closeDate != null && closeDate < t) return 'CLOSED';
  return 'OPEN';
}

/**
 * Slice 10.7 — is an OPEN activity past its (soft) due date? Due
 * dates never gate access — this only drives the "overdue" tint
 * on the student card. Null due date → never past due.
 */
export function isPastDue(
  dueDate: string | null | undefined,
  today?: string
): boolean {
  if (dueDate == null) return false;
  const t = today ?? new Date().toISOString().slice(0, 10);
  return dueDate < t;
}

/**
 * Slice 10.6 / 10.7 — display form for a window date (release /
 * due / close), e.g. "27 May 2026". The columns are plain DATEs
 * (day granularity, no zone); parsed as UTC so the rendered day
 * never shifts.
 */
export function formatWindowDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// =====================================================================
// Slice 10.1b — student curriculum launcher
// =====================================================================
//
// The student curriculum page is a course map / launcher, not a
// content reader: each activity row carries one action button and
// the actual consumption happens on the per-type viewer surface.
// This helper feeds the "~N min" estimate shown beside that
// button. The button label itself is a uniform "Open" — the
// per-type dispatch lives in <ActivityAction>, not in a label map.

/**
 * Estimated minutes for a student curriculum row, normalised
 * across the per-type payload split: TEXT / PDF / EXTERNAL_LINK
 * store `estimated_minutes`; ONLINE_LIVE_SESSION has no separate
 * estimate — its `duration_minutes` (the session length) doubles
 * as one; MOCK / PRACTICE_QUIZ carry none yet (it'll come from the
 * linked quiz). Returns null when unset, so callers skip the line.
 */
export function activityEstimatedMinutes(
  activity: ProgrammeActivity
): number | null {
  switch (activity.type) {
    case 'TEXT':
    case 'PDF':
    case 'EXTERNAL_LINK':
      return (
        (
          activity.payload as
            | ActivityPayloadText
            | ActivityPayloadPdf
            | ActivityPayloadExternalLink
        ).estimated_minutes ?? null
      );
    case 'ONLINE_LIVE_SESSION':
      return (
        (activity.payload as ActivityPayloadOnlineLiveSession)
          .duration_minutes ?? null
      );
    case 'MOCK':
    case 'PRACTICE_QUIZ':
      return null;
    case 'LIBRARY_NOTE':
      // Reading-time is derived on the note itself (read view); the
      // curriculum row doesn't carry an estimate.
      return null;
  }
}

// =====================================================================
// Shared link helpers
// =====================================================================
//
// Used by the per-type activity viewers (slice 10.2+) and the
// tutor editors. One copy each, so the student and tutor sides
// read a link the same way.

/**
 * Normalise a value to an http(s) href, or null. The per-type
 * viewers use this to gate clickable links: a missing, malformed,
 * or non-http(s) value renders an honest "unavailable" state
 * instead of a broken link. The action layer already restricts
 * schemes at write time — this is render-side defence-in-depth.
 */
export function safeHttpUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Short provider label from a meeting-URL host (Zoom / Google Meet
 * / etc.), falling back to the bare host. Shared by the online
 * live session editor (tutor) and viewer (student) so the provider
 * chip reads the same on both sides. Lowercased contains-checks
 * cover regional domains (us02web.zoom.us, teams.live.com, etc.).
 */
export function providerLabelFor(host: string): string {
  const h = host.toLowerCase();
  if (h.includes('zoom.us')) return 'Zoom';
  if (h.includes('meet.google.com')) return 'Google Meet';
  if (h.includes('teams.microsoft.com') || h.includes('teams.live.com'))
    return 'Microsoft Teams';
  if (h.includes('webex.com')) return 'Webex';
  if (h.includes('whereby.com')) return 'Whereby';
  return host.replace(/^www\./, '');
}

/**
 * Human-readable file size — "14 KB", "2.3 MB". Shared by the
 * tutor PDF editor and the student PDF viewer so an attached file
 * reads the same on both sides.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
