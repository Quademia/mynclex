// mynclex/lib/nav/tutor.ts
//
// Tutor nav configs. Two contexts, each with its own sidebar:
//   - Global    — cross-programme: programmes list, private bank,
//                 quizzes, students, payments, profile.
//   - Programme — scoped to one programme: curriculum, sessions,
//                 assignments, students, results.
//
// To add/remove/reorder a sidebar item, edit this file only.
//
// The global sidebar's "My Bank" item uses NavItem.children for its
// collapsible sub-nav (All questions / Case Studies / Trends). Sub-item
// hrefs use the existing route slug 'cases' (not 'case-studies') —
// the spec uses the longer name for the label, but the URL slug
// matches the existing /tutor/bank/cases route from slice 1.11a.
//
// The programme sidebar's hrefs contain a ':programmeId' placeholder
// that the programme layout swaps for the actual route param at
// render time — keeps the config a single source of truth and avoids
// per-programme branching in the sidebar component.

import type { NavItem } from './types';

export const TUTOR_GLOBAL_NAV: NavItem[] = [
  // Home — the tutor's cross-programme landing (login lands here). `exact`
  // so the row highlights only on `/tutor`, not every `/tutor/*` page.
  { key: 'home', label: 'Home', icon: 'home', href: '/tutor', exact: true },
  { key: 'programmes', label: 'Programmes',  icon: 'calendar', href: '/tutor/programmes' },
  {
    key: 'bank',
    label: 'My Bank',
    icon: 'book',
    href: '/tutor/bank/all',
    children: [
      { key: 'bank-all',    label: 'All questions', icon: 'book', href: '/tutor/bank/all' },
      { key: 'bank-cases',  label: 'Case Studies',  icon: 'book', href: '/tutor/bank/cases' },
      { key: 'bank-trends', label: 'Trend datasets', icon: 'book', href: '/tutor/bank/trends' },
    ],
  },
  // Slice 11.1 — tutor library landing. Sits between Bank and
  // Quizzes as a sibling content-authoring surface (Bank = practice;
  // Library = teaching). Icon `tutor` (a notes-page glyph) keeps it
  // visually distinct from the adjacent `book` Bank entry.
  { key: 'library',  label: 'Library',     icon: 'tutor', href: '/tutor/library' },
  { key: 'quizzes',  label: 'Quizzes',     icon: 'target', href: '/tutor/quizzes' },
  { key: 'students', label: 'My Students', icon: 'users', href: '/tutor/students' },
  { key: 'payments', label: 'Payments',    icon: 'card',  href: '/tutor/payments' },
  { key: 'profile',  label: 'Profile',     icon: 'user',  href: '/tutor/profile' },
];

/**
 * Programme-scoped nav. Hrefs contain ':programmeId' which the
 * programme layout replaces with the actual [programme_id] route
 * param before passing items into the sidebar component.
 */
export const TUTOR_PROGRAMME_NAV: NavItem[] = [
  { key: 'overview',    label: 'Overview',      icon: 'home',     href: '/tutor/programme/:programmeId/overview' },
  { key: 'cohorts',     label: 'Cohorts',       icon: 'users',    href: '/tutor/programme/:programmeId/cohorts' },
  // Payments Slice 7b — per-programme payment-plan config (upfront +
  // deposit + installments). Always shown; the page itself notes when
  // the programme collects off-platform (plans then don't apply).
  { key: 'payment-plans', label: 'Payment plans', icon: 'card',   href: '/tutor/programme/:programmeId/payment-plans' },
  { key: 'curriculum',  label: 'Curriculum',    icon: 'layers',   href: '/tutor/programme/:programmeId/curriculum' },
  // Tutor Quiz Slice 5 — programme-level quiz membership. Icon
  // `target` matches the global Quizzes nav entry above so the
  // iconography family stays consistent across the two sidebars.
  { key: 'quizzes',     label: 'Quizzes',       icon: 'target',   href: '/tutor/programme/:programmeId/quizzes' },
  { key: 'sessions',    label: 'Live Sessions', icon: 'video',    href: '/tutor/programme/:programmeId/sessions' },
  { key: 'assignments', label: 'Assignments',   icon: 'edit',     href: '/tutor/programme/:programmeId/assignments' },
  // Slice 8b — lead queue for programmes that surface a Contact form
  // (off-platform or price-hidden). Sits before Students in the funnel
  // order: enquiry → enrolment → student.
  { key: 'enquiries',   label: 'Enquiries',     icon: 'mail',     href: '/tutor/programme/:programmeId/enquiries' },
  { key: 'students',    label: 'Students',      icon: 'users',    href: '/tutor/programme/:programmeId/students' },
  { key: 'results',     label: 'Results',       icon: 'chart',    href: '/tutor/programme/:programmeId/results' },
];

/**
 * Cohort-scoped nav. Sibling world of the programme nav — opened
 * when a tutor clicks into a specific cohort run. Hrefs contain
 * ':cohortId' which the cohort layout replaces with the actual
 * [cohort_id] route param. Slice 9.2c set up the chrome; slice
 * 9.3f adds the Curriculum tab (the cohort's inclusion + release-
 * date controls over the programme's template activities).
 */
export const TUTOR_COHORT_NAV: NavItem[] = [
  { key: 'overview',      label: 'Overview',      icon: 'home',   href: '/tutor/cohort/:cohortId/overview' },
  { key: 'curriculum',    label: 'Curriculum',    icon: 'layers', href: '/tutor/cohort/:cohortId/curriculum' },
  // Enrolments (formerly "Students") — the administrative roster:
  // who's in, waitlist, statuses, add-student. Renamed in the cohort-
  // analytics slice so "Students"-style labelling is freed for a future
  // per-student view; Analytics (below) is the how-they're-doing surface.
  { key: 'enrolments',    label: 'Enrolments',    icon: 'users',  href: '/tutor/cohort/:cohortId/enrolments' },
  // Cohort analytics — completion (Phase 1) + quiz performance (Phase 2).
  // Sits next to Enrolments: who's in vs. how they're doing.
  { key: 'analytics',     label: 'Analytics',     icon: 'chart',  href: '/tutor/cohort/:cohortId/analytics' },
  { key: 'sessions',      label: 'Sessions',      icon: 'video',  href: '/tutor/cohort/:cohortId/sessions' },
  { key: 'announcements', label: 'Announcements', icon: 'edit',   href: '/tutor/cohort/:cohortId/announcements' },
  { key: 'settings',      label: 'Settings',      icon: 'settings', href: '/tutor/cohort/:cohortId/settings' },
];
