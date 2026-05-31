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

export const STUDENT_BANK_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard',       icon: 'home',   href: '/student/bank/dashboard' },
  { key: 'practice',  label: 'Question Bank',   icon: 'book',   href: '/student/bank/practice' },
  { key: 'packs',     label: 'Readiness Packs', icon: 'target', href: '/student/bank/packs' },
  { key: 'journey',   label: 'Journey Tracker', icon: 'map',    href: '/student/bank/journey' },
  { key: 'history',   label: 'History',         icon: 'clock',  href: '/student/bank/history' },
  { key: 'profile',   label: 'Profile',         icon: 'user',   href: '/student/bank/profile' },
];

/**
 * Programme-detail sidebar (slice 10.1; History added in progress
 * engine Slice 4). Hrefs carry ':programmeId', swapped by the
 * programme layout for the actual [programme_id] route param.
 */
export const STUDENT_PROGRAMME_DETAIL_NAV: NavItem[] = [
  { key: 'curriculum', label: 'Curriculum',   icon: 'layers', href: '/student/programme/:programmeId/curriculum' },
  // Tutor Library Slice 11.14 — the student-facing library (read-only
  // mirror of the tutor library). Icon `file-text` (notes) — distinct
  // from `book`, which Quizzes already uses in this same sidebar.
  { key: 'library',    label: 'Library',      icon: 'file-text', href: '/student/programme/:programmeId/library' },
  // Tutor Quiz Slice 6 — programme-level quizzes. Icon `book`
  // (the student's mental model is "a quiz to take," and `target`
  // already represents Readiness Packs in the global bank nav —
  // using a different icon here avoids cross-context collision).
  { key: 'quizzes',    label: 'Quizzes',      icon: 'book',   href: '/student/programme/:programmeId/quizzes' },
  { key: 'history',    label: 'Quiz History', icon: 'clock',  href: '/student/programme/:programmeId/history' },
];

/**
 * Cohort-detail sidebar (slice 10.1; History added in progress
 * engine Slice 4; Quizzes added in tutor-quiz Slice 6). Hrefs
 * carry ':cohortId', swapped by the cohort layout for the actual
 * [cohort_id] route param.
 */
export const STUDENT_COHORT_DETAIL_NAV: NavItem[] = [
  { key: 'curriculum', label: 'Curriculum',   icon: 'layers', href: '/student/cohort/:cohortId/curriculum' },
  // Tutor Library Slice 11.14b — student library, cohort (tutor-led)
  // sibling of the programme route. Same `file-text` icon as the
  // programme nav for consistency.
  { key: 'library',    label: 'Library',      icon: 'file-text', href: '/student/cohort/:cohortId/library' },
  { key: 'quizzes',    label: 'Quizzes',      icon: 'book',   href: '/student/cohort/:cohortId/quizzes' },
  { key: 'history',    label: 'Quiz History', icon: 'clock',  href: '/student/cohort/:cohortId/history' },
];
