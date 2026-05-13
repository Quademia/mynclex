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
 * Programme-detail sidebar (slice 10.1). Hrefs carry
 * ':programmeId', swapped by the programme layout for the actual
 * [programme_id] route param.
 */
export const STUDENT_PROGRAMME_DETAIL_NAV: NavItem[] = [
  { key: 'curriculum', label: 'Curriculum', icon: 'layers', href: '/student/programme/:programmeId/curriculum' },
];

/**
 * Cohort-detail sidebar (slice 10.1). Hrefs carry ':cohortId',
 * swapped by the cohort layout for the actual [cohort_id] route
 * param.
 */
export const STUDENT_COHORT_DETAIL_NAV: NavItem[] = [
  { key: 'curriculum', label: 'Curriculum', icon: 'layers', href: '/student/cohort/:cohortId/curriculum' },
];
