// mynclex/lib/nav/tutor.ts
//
// Tutor nav configs. Two contexts, each with its own sidebar:
//   - Global    — cross-programme: programmes list, private bank,
//                 students, payments, profile.
//   - Programme — scoped to one programme: curriculum, sessions,
//                 mocks, assignments, students, results.
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
  { key: 'curriculum',  label: 'Curriculum',    icon: 'layers',   href: '/tutor/programme/:programmeId/curriculum' },
  { key: 'sessions',    label: 'Live Sessions', icon: 'video',    href: '/tutor/programme/:programmeId/sessions' },
  { key: 'mocks',       label: 'Mocks',         icon: 'target',   href: '/tutor/programme/:programmeId/mocks' },
  { key: 'assignments', label: 'Assignments',   icon: 'edit',     href: '/tutor/programme/:programmeId/assignments' },
  { key: 'students',    label: 'Students',      icon: 'users',    href: '/tutor/programme/:programmeId/students' },
  { key: 'results',     label: 'Results',       icon: 'chart',    href: '/tutor/programme/:programmeId/results' },
];

/**
 * Cohort-scoped nav. Sibling world of the programme nav — opened
 * when a tutor clicks into a specific cohort run. Hrefs contain
 * ':cohortId' which the cohort layout replaces with the actual
 * [cohort_id] route param. Slice 9.2c. Curriculum tab queues
 * behind Phase B's nclex_programme_units/blocks/activities.
 */
export const TUTOR_COHORT_NAV: NavItem[] = [
  { key: 'overview',      label: 'Overview',      icon: 'home',   href: '/tutor/cohort/:cohortId/overview' },
  { key: 'students',      label: 'Students',      icon: 'users',  href: '/tutor/cohort/:cohortId/students' },
  { key: 'sessions',      label: 'Sessions',      icon: 'video',  href: '/tutor/cohort/:cohortId/sessions' },
  { key: 'announcements', label: 'Announcements', icon: 'edit',   href: '/tutor/cohort/:cohortId/announcements' },
  { key: 'settings',      label: 'Settings',      icon: 'settings', href: '/tutor/cohort/:cohortId/settings' },
];
