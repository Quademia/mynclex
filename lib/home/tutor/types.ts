// mynclex/lib/home/tutor/types.ts
//
// Shapes for the tutor Home dashboard (`/tutor`). The page is a
// cross-programme triage view: stat bar + "needs your attention"
// (enquiries + lagging cohorts) + this week's live sessions + the
// tutor's programmes + a content workspace band.
//
// All derived at read time from existing surfaces — see home-queries.ts.

/** Four headline counts in the stat bar. */
export type HomeStats = {
  /** Active (PUBLISHED) programmes. */
  programmes: number;
  /** Active (IN_PROGRESS) cohorts. */
  cohorts: number;
  /** Distinct ENROLLED students across active cohorts. */
  students: number;
  /** Open enquiries (status NEW or CONTACTED) across all programmes. */
  enquiries: number;
};

/** One prospective-student enquiry awaiting a reply. */
export type HomeEnquiry = {
  enquiryId: string;
  programmeId: string;
  name: string;
  /** Parent programme title. */
  programme: string;
  /** Relative age, e.g. "2 hours ago" / "Yesterday". */
  ago: string;
  /** Never-contacted (status NEW) → shows the "New" badge. */
  fresh: boolean;
};

/** One cohort flagged as lagging on completion. */
export type HomeBehindCohort = {
  cohortId: string;
  /** Parent programme id — the row links into the programme Cohorts
   * page's in-page run detail (?cohort=&tab=analytics). */
  programmeId: string;
  /** Cohort display name (or its date range). */
  cohort: string;
  /** Parent programme title. */
  programme: string;
  /** e.g. "avg 32% complete · 4 not started". */
  signal: string;
  /** Average completion 0–100, drives the mini bar. */
  avg: number;
  /** Severity → dot + bar colour. */
  sev: 'high' | 'med';
};

/** One upcoming live session within the next 7 days. */
export type HomeSession = {
  /** The live-session marker activity. */
  activityId: string;
  title: string;
  programmeId: string;
  /** Parent programme title. */
  programme: string;
  /** Cohort this scheduled session belongs to (Slice 1b — schedules
   * are per-cohort, so the chip links to the cohort's Sessions tab). */
  cohortId: string;
  /** Cohort display name, or null when unnamed. */
  cohortName: string | null;
  /** "Today" / "Tomorrow" / weekday short. */
  dayLabel: string;
  /** Local clock time, e.g. "6:00 PM". */
  timeLabel: string;
  /** Days from today (0–6) — the timeline column. */
  offset: number;
};

/** One programme card. */
export type HomeProgramme = {
  programmeId: string;
  title: string;
  tagline: string | null;
  /** Active cohort count. */
  cohorts: number;
  /** Enrolled students across its active cohorts. */
  students: number;
  /** Average completion across its active cohorts, 0–100. */
  avg: number;
  /** Health badge — `none` when there's no active cohort to measure. */
  health: 'on-track' | 'watch' | 'none';
};

/** One content workspace tile (Bank / Quizzes / Library). */
export type HomeWorkspaceTile = {
  count: number;
  unit: string;
  /** Loose-ends signal, e.g. "12 drafts" / "5 used nowhere". */
  signal: string;
  /** True when the signal is a loose-end (amber dot) vs. all-clear. */
  loose: boolean;
};

export type HomeWorkspace = {
  bank: HomeWorkspaceTile;
  quizzes: HomeWorkspaceTile;
  library: HomeWorkspaceTile;
};

/** Everything the Home view renders. */
export type TutorHomeData = {
  firstName: string;
  /** No programmes yet → the view shows the "getting started" body. */
  isFresh: boolean;
  stats: HomeStats;
  enquiries: HomeEnquiry[];
  behind: HomeBehindCohort[];
  sessions: HomeSession[];
  programmes: HomeProgramme[];
  workspace: HomeWorkspace;
};
