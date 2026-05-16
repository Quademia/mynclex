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
export type CompletionSource = 'QUIZ_ATTEMPT' | 'MANUAL';

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
