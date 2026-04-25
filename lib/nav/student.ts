// mynclex/lib/nav/student.ts
//
// Student nav configs. Two product spaces, each with its own sidebar:
//   - Bank (self-study question bank)
//   - Programme (tutored programme)
//
// To add/remove/reorder a sidebar item, edit this file only — the
// sidebar component reads the array verbatim. The 'bank' surface uses
// the key 'practice' (not 'bank') so the route is /student/bank/practice
// rather than the collision /student/bank/bank.

import type { NavItem } from './types';

export const STUDENT_BANK_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard',       icon: 'home',   href: '/student/bank/dashboard' },
  { key: 'practice',  label: 'Question Bank',   icon: 'book',   href: '/student/bank/practice' },
  { key: 'packs',     label: 'Readiness Packs', icon: 'target', href: '/student/bank/packs' },
  { key: 'journey',   label: 'Journey Tracker', icon: 'map',    href: '/student/bank/journey' },
  { key: 'history',   label: 'History',         icon: 'clock',  href: '/student/bank/history' },
  { key: 'profile',   label: 'Profile',         icon: 'user',   href: '/student/bank/profile' },
];

export const STUDENT_PROGRAMME_NAV: NavItem[] = [
  { key: 'overview', label: 'Programme Home', icon: 'home',     href: '/student/programme/overview' },
  { key: 'weeks',    label: 'Weeks',          icon: 'calendar', href: '/student/programme/weeks' },
  { key: 'sessions', label: 'Live Sessions',  icon: 'video',    href: '/student/programme/sessions' },
  { key: 'tasks',    label: 'My Tasks',       icon: 'check',    href: '/student/programme/tasks' },
  { key: 'profile',  label: 'Profile',        icon: 'user',     href: '/student/programme/profile' },
];
