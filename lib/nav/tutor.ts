// mynclex/lib/nav/tutor.ts
//
// Tutor nav configs. Two contexts, each with its own sidebar:
//   - Global    — cross-programme: programmes list, private bank,
//                 quizzes, students, payments, profile.
//   - Programme — scoped to one programme: curriculum, library,
//                 quizzes, enquiries, enrolments + the Delivery
//                 section (cohorts; the run detail is in-page).
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
  // Global lead inbox — every enquiry across all the tutor's programmes
  // (peer of the global Payments ledger). Sits before Students in the
  // funnel order: enquiry → enrolment → student → payment.
  { key: 'enquiries', label: 'Enquiries',  icon: 'mail',  href: '/tutor/enquiries' },
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
  // Payments Slice 7b — per-programme payment-plan config (upfront +
  // deposit + installments). Always shown; the page itself notes when
  // the programme collects off-platform (plans then don't apply).
  { key: 'payment-plans', label: 'Payment plans', icon: 'card',   href: '/tutor/programme/:programmeId/payment-plans' },
  { key: 'curriculum',  label: 'Curriculum',    icon: 'layers',   href: '/tutor/programme/:programmeId/curriculum' },
  // Programme-level library preview — a read-only "student preview" of
  // the notes students in this programme can see (TUTOR_WIDE ∪
  // PROGRAMME_SCOPED-to-here). Icon `tutor` matches the global Library
  // nav entry so the iconography family stays consistent across sidebars.
  { key: 'library',     label: 'Library',       icon: 'tutor',    href: '/tutor/programme/:programmeId/library' },
  // Tutor Quiz Slice 5 — programme-level quiz membership. Icon
  // `target` matches the global Quizzes nav entry above so the
  // iconography family stays consistent across the two sidebars.
  { key: 'quizzes',     label: 'Quizzes',       icon: 'target',   href: '/tutor/programme/:programmeId/quizzes' },
  // Enquiries folded into the GLOBAL /tutor/enquiries inbox (2026-06-25):
  // the per-programme tab is gone; the programme Overview's enquiries panel
  // links to /tutor/enquiries?programme=<id> (pre-scoped). The old route is
  // a redirect shim for bookmarks + the admin "open in tutor view" link.
  // The enrolment roster for BOTH delivery modes (moved up from the
  // cohort workspace 2026-06-12 — programme = people & money, cohort =
  // delivery). Tutor-led shows every cohort's rows (cohort-tagged +
  // filterable) + the cross-cohort Waitlist; self-paced shows the
  // cohortless rows.
  { key: 'enrolments',  label: 'Enrolments',    icon: 'users',    href: '/tutor/programme/:programmeId/enrolments' },
  // Mode-specific tabs sit LAST, under a labelled "Delivery" divider
  // (2026-06-12): the tabs common to both delivery modes keep identical
  // positions on every programme, and the one entry that exists only on
  // tutor-led — Cohorts, the doorway into the cohort workspace — stands
  // apart. Any future single-mode tab joins this bottom section.
  { key: 'cohorts',     label: 'Cohorts',       icon: 'users',    href: '/tutor/programme/:programmeId/cohorts', section: 'Delivery' },
  // The SELF_PACED counterpart of Cohorts, and the second occupant of this
  // section (2026-08-23). A self-paced programme has no cohort layer — the
  // programme IS the delivery unit — so the dashboard a tutor-led tutor
  // reaches through Cohorts → a cohort → Progress lives here instead.
  // The two are mutually exclusive by mode, so "Delivery" always shows
  // exactly one row: Cohorts on tutor-led, Progress on self-paced.
  { key: 'progress',    label: 'Progress',      icon: 'chart',    href: '/tutor/programme/:programmeId/progress', section: 'Delivery' },
  // Removed from the sidebar 2026-06-07 (MVP declutter): Live Sessions,
  // Assignments, Results. Live Sessions returned via the cohort-planner
  // redesign. ⭐ Results is now GONE, not delisted — the self-paced
  // Progress row above is what it was holding the place for, and its
  // placeholder route was deleted rather than renamed: "Results" says
  // scores, and this surface is mostly engagement and completion with
  // scores as one part of it. Assignments is still TBD and still delisted.
  // ⚠ Corrected 2026-08-21: this comment claimed the tutor Home "This
  // week" block links to /sessions, which was the one thing keeping that
  // placeholder reachable. It does not — the cohort-planner work
  // repointed it at the cohort Sessions TAB
  // (`/tutor/programme/:id/cohorts?cohort=…&tab=sessions`, see
  // lib/home/tutor/tutor-home.tsx). All four delisted placeholders are
  // now unreachable from anywhere in the UI.
  // Removed 2026-06-12: Students — overtaken by Enrolments (admin roster,
  // cohort + self-paced) and cohort Analytics (performance); the future
  // per-student 360 likely lives at the GLOBAL My Students page instead.
  // Placeholder route still exists; restoring is one line.
];

// The cohort-scoped nav (TUTOR_COHORT_NAV) was retired in the
// cohort-workspace fold (2026-06-12): the cohort run detail now
// renders IN PLACE on the programme Cohorts page (?cohort= + ?tab=,
// the library pattern), so a cohort no longer has its own sidebar.
// Tab config lives in lib/cohorts/cohort-detail.tsx.
