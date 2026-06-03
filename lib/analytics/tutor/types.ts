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
}
