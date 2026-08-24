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

/**
 * Self-paced engagement status. A cohort shares a calendar, so "behind"
 * means something there. A self-paced programme has none — every student
 * starts on the day they buy and the whole curriculum unlocks at once, so
 * a completion % has no shared referent: a student on 4% who joined
 * yesterday and one who joined in March are the same number and utterly
 * different situations. This vocabulary is time-based instead — has the
 * student ever engaged, and how recently.
 *
 *   notstarted — no engagement of any kind, ever
 *   active     — engaged within STALLED_AFTER_DAYS
 *   stalled    — engaged once, but not lately
 *   done       — every visible activity complete
 *
 * `endingSoon` on the row is an ORTHOGONAL overlay, not a fifth state: a
 * student can be active AND about to lose access. See ACCESS_SOON_DAYS.
 */
export type EngagementStatus = 'notstarted' | 'active' | 'stalled' | 'done';

/** Which delivery unit an analytics payload describes. */
export type AnalyticsMode = 'COHORT' | 'SELF_PACED';

/**
 * No engagement for this many days reads as stalled (self-paced only).
 *
 * ⚠ This number also lives in SQL — the nightly inactivity sweep in
 * migration 20260922120000 uses `interval '14 days'` for the first nudge.
 * The screen calls a student "Stalled" at this threshold and the email is
 * what the screen implies has happened, so the two must move together. It
 * is deliberately NOT admin-configurable (Sam, 2026-08-24): the feature has
 * one switch, not a panel of dials.
 */
export const STALLED_AFTER_DAYS = 14;

/** Access ending within this many days raises the "Ending soon" flag. */
export const ACCESS_SOON_DAYS = 30;

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
  /** SELF_PACED only — the time-based status the self-paced view renders
   *  instead of `status`. Null on cohort rows. */
  engagement: EngagementStatus | null;
  /** BOTH MODES — whole days since this student enrolled.
   *
   *  Self-paced: their personal "week 1", and the anchor that makes a
   *  completion % readable ("joined 3 weeks ago, 12% done").
   *
   *  Cohort: the late-join explanation. A cohort's pace status measures
   *  each student against everything RELEASED so far, so somebody who
   *  enrolled in week 5 reads as behind or at risk through no fault of
   *  their own — and without this the row gives the tutor no way to tell
   *  that from a student who has been there since day one and stopped.
   *  (Cohorts support late joining explicitly; the workspace header even
   *  carries a "Late join on" flag.) */
  joinedDays: number | null;
  /** BOTH MODES — whole days until this student's access window closes.
   *  Null = lifetime access. Never negative: the nightly sweep expires a
   *  lapsed enrolment out of the counted roster.
   *
   *  ⚠ This is per-STUDENT in a cohort too, which is easy to get wrong.
   *  Access is frozen as `enrolled_at + programme.access_window_days` —
   *  anchored to when each person joined, NOT to the cohort — so two
   *  students in one cohort routinely hold different end dates, and
   *  `nclex_cohorts.end_date` is a TIMETABLE that need not resemble either
   *  of them (dev has a cohort that ended Jul 2026 whose students keep
   *  access until Jun 2027). The nightly sweep expires on THIS column, so
   *  it, not the cohort's dates, is what actually cuts a student off. */
  accessDaysLeft: number | null;
  /** BOTH MODES — access closes within ACCESS_SOON_DAYS with work still
   *  undone. An overlay on the status, never a state of its own: a student
   *  can be working hard and still about to lose the material. */
  endingSoon: boolean;
  /** Days since their most recent completion; null = no activity ever. */
  lastActiveDays: number | null;
  /**
   * SELF_PACED only — days since the system last sent this student an
   * inactivity nudge, or null if it never has.
   *
   * ⭐ It is here so a tutor about to ring somebody can see that we wrote
   * to them this morning. Without it the automation is invisible to the
   * one person whose behaviour it is meant to change: they would chase
   * students the system had already chased, which is precisely the
   * duplicated effort the nudge exists to remove.
   *
   * ⓘ SENT, not queued — see nclex_programme_nudge_history.
   */
  lastNudgedDays: number | null;
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
  /** SELF_PACED only — counts per engagement state. Null on cohort. */
  engagement: Record<EngagementStatus, number> | null;
  /** Students whose access closes within ACCESS_SOON_DAYS with work still
   *  outstanding. Populated for both modes; only the self-paced view
   *  surfaces it as a headline figure so far. */
  endingSoon: number | null;
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

/** Per-question difficulty within a quiz — the "re-teach signal" (2b). */
export interface QuestionMissRate {
  itemId: string;
  stem: string;
  questionType: string;
  /** The quiz this question belongs to (for the cross-quiz ranked list). */
  quizId: string;
  quizTitle: string;
  /** Distinct students who answered it. */
  answered: number;
  /** Of those, how many got it wrong. */
  wrong: number;
  /** wrong / answered, 0–100. */
  missRate: number;
}

export interface CohortQuizPerformance {
  quizzes: QuizPerfRow[];
  byStudent: Record<string, StudentQuizPerf>;
  /** Hardest questions across the cohort's quizzes, sorted by miss-rate
   *  desc (2b). Empty when no per-answer data is readable yet. */
  missRates: QuestionMissRate[];
  summary: {
    avgQuizScore: number | null;
    passRate: number | null;
    attempts: number;
    passes: number;
    /** Students whose most recent graded quiz was a fail. */
    perfRisk: number;
  };
}

export interface TutorAnalytics {
  /** Which delivery unit this describes. The view branches its copy and
   *  its status vocabulary on this — a cohort is paced against a shared
   *  calendar, a self-paced programme against each student's own clock. */
  mode: AnalyticsMode;
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

/**
 * The original name, kept as an alias. Every cohort call site still reads
 * `CohortAnalytics`; the self-paced sibling produces the same shape with
 * `mode: 'SELF_PACED'` — which is why the underlying type lost the word
 * "cohort" instead of being duplicated.
 */
export type CohortAnalytics = TutorAnalytics;
