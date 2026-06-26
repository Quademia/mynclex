// mynclex/lib/nav/student.ts
//
// Student nav configs.
//
//   - Bank (self-study question bank) — global sidebar at
//     /student/bank/*. Unchanged since the 2026-04-25 scaffold.
//   - Programme detail (slice 10.1) — scoped to one programme
//     at /student/programme/[programme_id]/*. The href carries a
//     ':programmeId' placeholder which the layout swaps for the
//     actual route param at render time, mirroring the tutor-side
//     programme nav pattern.
//   - Cohort detail (slice 10.1) — scoped to one cohort at
//     /student/cohort/[cohort_id]/*. ':cohortId' placeholder,
//     same swap mechanic.
//
// Programme + cohort detail sidebars carry one item each in 10.1
// (Curriculum). Additional tabs (Overview, Sessions, Tasks, etc.)
// land with the slices that build their content — empty
// placeholder rooms are not added in advance.
//
// To add/remove/reorder an item, edit this file only. The sidebar
// component reads the array verbatim.

import type { NavItem } from './types';

// `mobileTab` promotes a row to the mobile bottom-tab bar (≤768px); it
// still renders in the drawer too. 4 per context, in this order.
export const STUDENT_BANK_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard',       icon: 'home',   href: '/student/bank/dashboard', mobileTab: true },
  { key: 'practice',  label: 'Question Bank',   icon: 'book',   href: '/student/bank/practice',  mobileTab: true, tabLabel: 'Practice' },
  { key: 'packs',     label: 'Readiness Packs', icon: 'target', href: '/student/bank/packs',     mobileTab: true, tabLabel: 'Packs' },
  { key: 'journey',   label: 'Journey Tracker', icon: 'map',    href: '/student/bank/journey' },
  { key: 'history',   label: 'History',         icon: 'clock',  href: '/student/bank/history',   mobileTab: true },
  { key: 'profile',   label: 'Profile',         icon: 'user',   href: '/student/bank/profile' },
];

/**
 * Programme-detail sidebar (slice 10.1; History added in progress
 * engine Slice 4). Hrefs carry ':programmeId', swapped by the
 * programme layout for the actual [programme_id] route param.
 */
export const STUDENT_PROGRAMME_DETAIL_NAV: NavItem[] = [
  // Student Overview (2026-06) — the mode-aware home / landing surface.
  // First item; also the index redirect target. `home` icon, exact match
  // (its href is a prefix of every sibling tab). Mobile: the first bottom
  // tab — Quiz History drops off the bar to keep ≤4 (still in the drawer).
  { key: 'overview',   label: 'Overview',     icon: 'home',   href: '/student/programme/:programmeId/overview', exact: true, mobileTab: true },
  { key: 'curriculum', label: 'Curriculum',   icon: 'layers', href: '/student/programme/:programmeId/curriculum', mobileTab: true },
  // Tutor Library Slice 11.14 — the student-facing library (read-only
  // mirror of the tutor library). Icon `file-text` (notes) — distinct
  // from `book`, which Quizzes already uses in this same sidebar.
  { key: 'library',    label: 'Library',      icon: 'file-text', href: '/student/programme/:programmeId/library', mobileTab: true },
  // Tutor Quiz Slice 6 — programme-level quizzes. Icon `book`
  // (the student's mental model is "a quiz to take," and `target`
  // already represents Readiness Packs in the global bank nav —
  // using a different icon here avoids cross-context collision).
  { key: 'quizzes',    label: 'Quizzes',      icon: 'book',   href: '/student/programme/:programmeId/quizzes', mobileTab: true },
  { key: 'history',    label: 'Quiz History', icon: 'clock',  href: '/student/programme/:programmeId/history' },
];

/**
 * Cohort-detail sidebar (slice 10.1; History added in progress
 * engine Slice 4; Quizzes added in tutor-quiz Slice 6). Hrefs
 * carry ':cohortId', swapped by the cohort layout for the actual
 * [cohort_id] route param.
 */
export const STUDENT_COHORT_DETAIL_NAV: NavItem[] = [
  // Student Overview (2026-06) — see the programme nav note above. Cohort
  // mode shows the next-session + attendance cards. Mobile bottom tabs:
  // Overview · Curriculum · Sessions · Library (Quizzes drops off the bar
  // to keep ≤4 — still reachable in the drawer).
  { key: 'overview',   label: 'Overview',     icon: 'home',   href: '/student/cohort/:cohortId/overview', exact: true, mobileTab: true },
  { key: 'curriculum', label: 'Curriculum',   icon: 'layers', href: '/student/cohort/:cohortId/curriculum', mobileTab: true },
  // Live sessions Slice 3b — the student "My sessions" page (cohort-only;
  // self-paced has no live sessions, so this entry is NOT on the programme
  // nav). `calendar` icon — sessions are scheduled events.
  { key: 'sessions',   label: 'Sessions',     icon: 'calendar', href: '/student/cohort/:cohortId/sessions', mobileTab: true },
  // Tutor Library Slice 11.14b — student library, cohort (tutor-led)
  // sibling of the programme route. Same `file-text` icon as the
  // programme nav for consistency.
  { key: 'library',    label: 'Library',      icon: 'file-text', href: '/student/cohort/:cohortId/library', mobileTab: true },
  { key: 'quizzes',    label: 'Quizzes',      icon: 'book',   href: '/student/cohort/:cohortId/quizzes' },
  { key: 'history',    label: 'Quiz History', icon: 'clock',  href: '/student/cohort/:cohortId/history' },
];
