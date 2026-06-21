// mynclex/lib/home/student/types.ts
//
// Shapes for the Student Overview — the mode-aware programme/cohort home
// (2026-06, from the Claude Design "Student Overview" prototype). One data
// object produced by lib/home/student/overview-queries.ts and rendered by
// student-overview.tsx. The student-side parallel of lib/home/tutor/.
//
// "Mode" is fixed by the route, NOT a runtime toggle (the CD's "Preview
// as" switch is a demo affordance): the programme route is always
// self-paced, the cohort route always tutor-led. The shared view branches
// on `mode` for the few mode-specific pieces (cohort name, next-session vs
// study-streak card, attendance).

import type {
  LiveSessionPlatform,
  StudentActivity,
} from '@/lib/curriculum/types';
import type { RailUnit } from '@/lib/curriculum/student-curriculum-pane';

export type StudentOverviewMode = 'self' | 'cohort';

// The "Pick up where you left off" target. Carries the full
// StudentActivity so the banner reuses <ActivityAction> for a real,
// per-type launch (modal / read view / quiz resume) — same dispatch the
// curriculum uses, no duplicated launch logic.
export type OverviewContinue = {
  activity: StudentActivity;
  /** "Week 2" / "Module 2" — the unit the activity lives in. */
  unitLabel: string;
  /** Student-facing type wording — "Reading", "Mock", … */
  typeLabel: string;
  /** Per-type emoji icon (shared ACTIVITY_TYPE_ICON). */
  icon: string;
  /** TRUE when resuming an in-progress quiz (flips the eyebrow copy). */
  isResume: boolean;
};

// The soonest upcoming live session (cohort mode only) for the navy rail
// card. null when nothing is scheduled ahead.
export type OverviewNextSession = {
  title: string;
  scheduledAt: string | null; // UTC ISO; null = "Date to be announced"
  durationMinutes: number | null;
  platform: LiveSessionPlatform | null;
  joinUrl: string | null;
};

// Self-paced study streak (consecutive UTC days with ≥1 completed
// activity in this programme). `current` is the live run (held if the
// most recent study day is today or yesterday); `best` is the longest
// run ever. See overview-queries.ts → studyStreak().
export type OverviewStreak = { current: number; best: number };

export type StudentOverviewData = {
  mode: StudentOverviewMode;

  // Paths (already substituted with the real id).
  basePath: string; // /student/programme/<id> | /student/cohort/<id>
  curriculumHref: string; // basePath + /curriculum
  libraryBasePath: string; // basePath + /library

  // Identity.
  firstName: string; // greeting forename; '' falls back to a neutral hello
  programmeTitle: string;
  cohortName: string | null; // cohort mode only

  // Headline progress (fused across every visible activity, the same
  // numbers the curriculum unit rail shows).
  overallPct: number; // 0..100 — the hero ring
  activitiesDone: number;
  activitiesTotal: number;
  weeksDone: number; // units at 100%
  weeksTotal: number;
  unitNoun: 'week' | 'module';
  heroStreak: number; // attendance streak (cohort) | study streak (self)

  // Sections.
  weeks: RailUnit[]; // "Your weeks" — empty for single-unit programmes
  continue: OverviewContinue | null; // null = all caught up / nothing open
  nextSession: OverviewNextSession | null; // cohort only
  studyStreak: OverviewStreak | null; // self only

  // Request-time "now" (stamped server-side) for the next-session
  // countdown — keeps it stable through render.
  nowMs: number;
};
