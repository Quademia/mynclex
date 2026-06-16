// mynclex/lib/progress/types.ts
//
// Progress engine — Slice 1.
// Shape mirrors nclex_student_activity_progress (migration
// 20260518120000_progress_engine_1_foundation.sql). Per the spec
// (docs/product-plan/progress-engine.md §1), the table stores the
// completion record only — NOT_STARTED is implicit (absence of a
// row); IN_PROGRESS for quiz types is derived from nclex_attempts
// at read time.

// Which write path produced the row.
//   QUIZ_ATTEMPT — written by the nclex_progress_on_attempt_terminal
//                  trigger when a programme attempt becomes terminal.
//   MANUAL       — written by Slice 2's mark/un-mark server actions.
//   ATTENDANCE   — written by the nclex_progress_on_attendance trigger
//                  when a tutor marks a student PRESENT at a live
//                  session (live-session attendance, Slice 3). Like
//                  QUIZ_ATTEMPT it's derived (never student-self-marked);
//                  carries marked_by (the tutor) and no attempt_id.
export type CompletionSource = 'QUIZ_ATTEMPT' | 'MANUAL' | 'ATTENDANCE';

// One progress row as the curriculum-side reads care about it.
// (progress_id, student_id, marked_by, created_at, updated_at are
// available on the table but not surfaced here — current callers
// don't need them. Add when a real consumer asks.)
export type ActivityProgressRow = {
  activity_id: string;
  completion_source: CompletionSource;
  completed_at: string;
  attempt_id: string | null;
};

// Lookup by activity_id. Absence of a key == NOT_STARTED.
export type ActivityProgressMap = Map<string, ActivityProgressRow>;

// Derived IN_PROGRESS signal for quiz types — Map<activity_id,
// last_activity_at_iso>. Sourced from nclex_attempts (not stored
// in the progress table per §1). Used by both the row's
// "In progress" pill (Slice 3) and the "Where I left off" finder
// (which sorts by the timestamp to pick the most recent).
export type InProgressQuizMap = Map<string, string>;
