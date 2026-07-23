// mynclex/lib/home/student/bank/types.ts
//
// Shapes for the Bank Dashboard — the student's home for the Question
// Bank product (CAT plan §19.4 Slice 9, built from the Claude Design
// "Bank Dashboard" variant 2d handoff). One data object produced by
// ./queries.ts and rendered by ./bank-dashboard.tsx.
//
// Sub-grouped under lib/home/student/ because the bank home and the
// programme home are independent surfaces that happen to share an
// audience. A home surface AGGREGATES — nothing here owns a table.
//
// Honesty rule (settled with Sam 2026-07-22/23): every field on this
// page maps to something we actually store. Where the design showed an
// invented figure it was replaced, not approximated — see ./readiness.ts
// for the readiness band, which is the sharpest case.

import type { BankAccuracy } from './accuracy';
import type { NavIcon as NavIconName } from '@/lib/nav/types';

// ── Card 2 · Bank-access countdown ───────────────────────────
export type BankAccessCard = {
  /** Whole days remaining on the furthest-running active bank pass. */
  daysLeft: number;
  /** Length of that same pass's window, in days. Null = no bar. */
  windowDays: number | null;
  /** Eyebrow — "Bank 90-day", or "Bank access" with no window. Names
   *  WHICH pass is counting down when subscriptions are stacked. */
  label: string;
  /** Remaining fraction of the window, 0–100. Null when windowDays is. */
  percentLeft: number | null;
};

// ── Card 3 · Study streak ────────────────────────────────────
export type BankStreak = {
  current: number;
  best: number;
  /** The week strip: last 7 days, oldest first, true = studied. */
  days: boolean[];
  /** Derived encouragement line — never a number the strip contradicts. */
  caption: string;
};

// ── Card 4 · Resume banner ───────────────────────────────────
// NO invented subject. A bank quiz is built from filters and has no
// single topic, so the design's "Pharmacology · Untimed practice" is a
// title we cannot honestly produce — the mode IS the title. The
// dashboard offers Resume only; discarding an attempt stays on the
// practice page, where the consequence is explained.
export type ResumeCard = {
  attemptId: string;
  /** "Untimed Learning", "Timed · Sequential" — resolved upstream. */
  modeLabel: string;
  done: number;
  total: number;
  /** "3h ago" / "yesterday". */
  savedWhen: string;
  href: string;
};

// ── Card 9 · "Where to next" doorways ────────────────────────
export type Doorway = {
  key: string;
  /** From the app's own icon set (components/nav/shared/nav-icon), so
   *  a door and its sidebar entry are the same shape. */
  icon: NavIconName;
  title: string;
  /** The live figure under the title. Null when we have no honest
   *  number for it — the row still opens, it just says nothing. */
  sub: string | null;
  /** Null = not openable yet (Journey Tracker, which isn't built). A
   *  locked door beats inventing "Phase 3 of 7" for a pillar that
   *  doesn't exist. */
  href: string | null;
  /** `attention` draws the eye to something waiting (unclaimed
   *  credits); `locked` greys the row out. */
  tone: 'default' | 'attention' | 'locked';
};

// ── Card 7 · Recent activity ─────────────────────────────────
export type RecentBadgeTone = 'good' | 'neutral' | 'low';

export type RecentItem = {
  key: string;
  icon: string;
  /** Mode-only, like the resume banner — no invented subject. */
  title: string;
  meta: string;
  /** Per-source result: a percentage for a practice quiz, the BAND
   *  WORD for a readiness pack (our packs have no pass/fail), the
   *  verdict for a CAT. Null while a sitting is unfinished. */
  badge: { label: string; tone: RecentBadgeTone } | null;
  href: string | null;
};

// ── The page ─────────────────────────────────────────────────
export type BankDashboardData = {
  /** Forename only — the greeting reads "Welcome back, Ama". */
  firstName: string;
  /** "Thursday, 23 July" — formatted server-side. */
  todayLabel: string;
  /** Null only in the defensive case of no active pass; the route
   *  gate means a student without bank access never gets here. */
  access: BankAccessCard | null;
  streak: BankStreak;
  /** Null when there's nothing unfinished to pick up. */
  resume: ResumeCard | null;
  accuracy: BankAccuracy;
  doorways: Doorway[];
  recent: RecentItem[];
};
