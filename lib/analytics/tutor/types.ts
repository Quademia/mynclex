// mynclex/lib/analytics/tutor/types.ts
//
// Cohort analytics — shared types. Audience-grouped under
// lib/analytics/<audience>/ (CLAUDE.md convention #9); the student-facing
// self-view and bank-readiness analytics would live in lib/analytics/student/.
//
// Phase 1 (this slice) is COMPLETION only. The shapes carry a few
// Phase-2 (performance / quiz-score) fields as optional/nullable so the
// performance slice slots in without reshaping — but nothing here reads
// quiz attempts yet.

import type { ActivityType } from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';

/**
 * Pace-relative completion status, derived per student from their
 * completion % of released material (progress-engine.md §6.2). Thresholds
 * are the "balanced" set from the CD handoff (on-track ≥75, behind ≥40),
 * shipped hardcoded — no user-facing sensitivity control in v1.
 */
export type CompletionStatus = 'ontrack' | 'behind' | 'risk' | 'notstarted';

/** One activity in the cohort's effective (included + visible) curriculum. */
export interface ActivityAnalyticsRow {
  activityId: string;
  title: string;
  type: ActivityType;
  /** For MOCK / PRACTICE_QUIZ: the quiz this activity launches (payload
   *  quiz_id), so the drawer can map a quiz row to its performance score. */
  quizId: string | null;
  unitIndex: number;
  unitTitle: string;
  released: boolean;
  /** Completion across the counted roster (released rows only carry a bar). */
  doneCount: number;
  total: number;
  pct: number;
}

/** Per-student completion summary + the per-activity done set for the drawer. */
export interface StudentAnalyticsRow {
  userId: string;
  name: string;
  email: string;
  /** Released activities this student has completed. */
  doneCount: number;
  /** Denominator = released activities (the fair, "so far" measure). */
  releasedCount: number;
  /** done / released, 0–100. */
  completionPct: number;
  /** done / all-included activities (released + locked) — secondary figure. */
  programmePct: number;
  status: CompletionStatus;
  /** Days since their most recent completion; null = no activity ever. */
  lastActiveDays: number | null;
  /** activity_id → completed_at ISO (or null when done without a timestamp,
   *  e.g. a derived shelf rollup). Drives the drawer timeline. */
  doneAt: Record<string, string | null>;
}

export interface CohortAnalyticsSummary {
  studentCount: number;
  avgCompletion: number;
  buckets: Record<CompletionStatus, number>;
  /** Students inactive for ≥7 days (based on last completion). */
  stale: number;
}

// ── Phase 2 — quiz performance (teal) ──────────────────────────────────

/** One quiz the cohort has reached. Keyed by quiz_id (NOT the curriculum
 *  activity): attempts are identified by quiz_id regardless of launch path,
 *  and the same quiz can be placed as more than one activity. */
export interface QuizPerfRow {
  quizId: string;
  title: string;
  type: 'MOCK' | 'PRACTICE_QUIZ';
  unitIndex: number;
  /** Students with ≥1 terminal (scored) attempt. */
  attempted: number;
  /** Best-attempt passes — only meaningful when graded. */
  passed: number;
  /** passed / attempted, 0–100; null when the quiz has no pass mark. */
  passRate: number | null;
  /** Mean of each student's best score, 0–100. */
  avgScore: number;
  graded: boolean;
}

/** A student's quiz standing, merged into their completion row by userId. */
export interface StudentQuizPerf {
  /** Mean of best scores across quizzes they've reached, 0–100; null = none. */
  avgScore: number | null;
  /** Most recent terminal attempt's score, 0–100; null = none. */
  latestScore: number | null;
  /** Whether that latest attempt passed (null = ungraded or none). */
  latestPass: boolean | null;
  /** Latest graded attempt was a fail. Drives the "failed last quiz" flag. */
  failedLatest: boolean;
  /** Per-quiz best score (quizId → score% + pass), for the drawer. */
  scores: Record<string, { score: number; pass: boolean | null }>;
}

export interface CohortQuizPerformance {
  quizzes: QuizPerfRow[];
  byStudent: Record<string, StudentQuizPerf>;
  summary: {
    avgQuizScore: number | null;
    passRate: number | null;
    attempts: number;
    passes: number;
    /** Students whose most recent graded quiz was a fail. */
    perfRisk: number;
  };
}

export interface CohortAnalytics {
  meta: {
    cohortName: string;
    programmeTitle: string;
    unitLabel: UnitLabel;
    currentUnit: number;
    totalUnits: number;
    releasedCount: number;
    totalCount: number;
  };
  summary: CohortAnalyticsSummary;
  students: StudentAnalyticsRow[];
  activities: ActivityAnalyticsRow[];
  /** Weekly completion volume since cohort start — the headline sparkline. */
  completionTrend: number[];
  /** Phase 2 — present only when requested (the Analytics tab); null on the
   *  lighter Overview teaser read. */
  performance: CohortQuizPerformance | null;
}
