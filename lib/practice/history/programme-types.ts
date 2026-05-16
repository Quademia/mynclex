// mynclex/lib/practice/history/programme-types.ts
//
// Progress engine Slice 4 — programme-side attempt history row.
// Parallel shape to HistoryAttempt (lib/practice/history/types.ts)
// but tuned for programme-assigned attempts:
//   • no filters_json (programme attempts have none — questions
//     come from a fixed quiz, not a filter pool);
//   • carries the activity title + unit label so the Session column
//     can read "Pharmacology Mock · Week 3" instead of the bank-
//     side summariseRecent() output;
//   • carries activity_id so the activity-filter dropdown can group
//     rows;
//   • carries activity_is_done — the optional DONE badge sourced
//     from the progress engine (separate from the per-attempt
//     status — a COMPLETED attempt can have a non-DONE activity if
//     voided, etc.).
//
// AttemptStatus is shared with the bank-side row (re-exported from
// ./types). Source is always PROGRAMME_ASSIGNED on these rows so
// it's not stored on the type.

import type { AttemptStatus } from './types';

export type { AttemptStatus };

export type ProgrammeActivityType =
  | 'TEXT'
  | 'PDF'
  | 'EXTERNAL_LINK'
  | 'ONLINE_LIVE_SESSION'
  | 'MOCK'
  | 'PRACTICE_QUIZ';

export interface ProgrammeHistoryAttempt {
  attempt_id: string;
  created_at: string;
  status: AttemptStatus;

  /** Mode label resolved at fetch time (e.g. "Untimed Test"). */
  mode_label: string;

  /** Item-equivalent average (0–1). Null while IN_PROGRESS / ABANDONED. */
  final_score: number | null;

  /** Pass threshold this attempt is graded against (0–1).
   *  Tutor-quiz Slice 3 added pass_score; rendered as a pass/fail
   *  hint alongside the score when populated. */
  pass_score: number | null;

  /** The programme activity this attempt belongs to. */
  activity_id: string;
  activity_title: string;
  activity_type: ProgrammeActivityType;

  /** Parent unit context — for the "· Week N" suffix in the
   *  Session column. unit_title is the tutor-set name (nullable);
   *  the viewer falls back to "Week N" / "Module N" when null. */
  unit_index: number;
  unit_title: string | null;

  /** Progress-engine signal — does the student currently have a
   *  DONE row for this activity? Separate from the attempt's own
   *  status; an attempt can be COMPLETED but the activity isn't
   *  DONE if the row was voided. Drives the small ✓ badge next to
   *  the activity title. */
  activity_is_done: boolean;

  /** 1-based chronological position of this attempt within all the
   *  student's attempts against this activity (1 = first ever).
   *  Computed over the FULL set per (student, activity) before the
   *  50-row display cap, so an ordinal is stable even when older
   *  attempts fall off the visible window. */
  attempt_ordinal: number;

  /** Max attempts allowed by the activity's CURRENTLY-linked quiz
   *  (the v1 choice — "current cap" rather than "cap at attempt
   *  time"; no schema change required). NULL = uncapped, quiz
   *  unlinked, or the linked quiz isn't readable. Cell renders as
   *  "N of M" when set; just "N" otherwise. If attempt_ordinal
   *  exceeds max_attempts (cap dropped post-hoc), the cell falls
   *  back to just "N" to avoid rendering the contradictory "3 of 2". */
  max_attempts: number | null;
}
