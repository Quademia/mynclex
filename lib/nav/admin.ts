// mynclex/lib/nav/admin.ts
//
// Admin nav config. 15 items, each gated on a permission bucket
// (or the special 'SUPER_ADMIN' sentinel for the Permissions page).
// The AdminShell helper filters this list by the current user's
// permissions + role before passing it to the sidebar.
//
// Bank entry has children — same collapsible pattern as tutor's
// "My Bank". Sub-items inherit BANK_CURATE.
//
// Adding a new admin section = add an entry here, add the page route,
// and seed the permission bucket in nclex_admin_permissions if it's
// new. No hardcoded list to keep in sync — automation rule 4.
//
// Spec ↔ code permission mapping (spec is dotted-lowercase, code is
// SCREAMING_SNAKE per the existing BANK_CURATE / PAYMENTS_MANAGE
// rows that already shipped):
//
//   bank.manage        → BANK_CURATE     (already in code)
//   users.manage       → USERS_MANAGE
//   tutors.manage      → TUTORS_MANAGE
//   programmes.view    → PROGRAMMES_VIEW
//   payments.manage    → PAYMENTS_MANAGE (already in code)
//   comms.manage       → COMMS_MANAGE
//   system.manage      → SYSTEM_MANAGE

import type { NavItem } from './types';

export const ADMIN_NAV: NavItem[] = [
  { key: 'dashboard',    label: 'Dashboard',           icon: 'home',     href: '/admin/dashboard',     permission: null },
  {
    key: 'bank',
    label: 'Bank',
    icon: 'book',
    href: '/admin/bank/all',
    permission: 'BANK_CURATE',
    children: [
      { key: 'bank-all',    label: 'All questions',     icon: 'book', href: '/admin/bank/all',    permission: 'BANK_CURATE' },
      { key: 'bank-all-v2', label: 'All questions (v2)', icon: 'edit', href: '/admin/bank/all-v2', permission: 'BANK_CURATE' },
      { key: 'bank-cases',  label: 'Case Studies',      icon: 'book', href: '/admin/bank/cases',  permission: 'BANK_CURATE' },
      { key: 'bank-cases-v2', label: 'Case Studies (v2)', icon: 'edit', href: '/admin/bank/cases-v2', permission: 'BANK_CURATE' },
      { key: 'bank-trends', label: 'Trends',            icon: 'book', href: '/admin/bank/trends', permission: 'BANK_CURATE' },
      { key: 'bank-trends-v2', label: 'Trend datasets (v2)', icon: 'edit', href: '/admin/bank/trends-v2', permission: 'BANK_CURATE' },
    ],
  },
  { key: 'packs',         label: 'Readiness Packs',     icon: 'target',   href: '/admin/packs',         permission: 'BANK_CURATE' },
  { key: 'users',         label: 'Users',               icon: 'users',    href: '/admin/users',         permission: 'USERS_MANAGE' },
  { key: 'tutors',        label: 'Tutors',              icon: 'tutor',    href: '/admin/tutors',        permission: 'TUTORS_MANAGE' },
  { key: 'applications',  label: 'Tutor Applications',  icon: 'apply',    href: '/admin/applications',  permission: 'TUTORS_MANAGE' },
  { key: 'programmes',    label: 'Programmes',          icon: 'calendar', href: '/admin/programmes',    permission: 'PROGRAMMES_VIEW' },
  { key: 'enrolments',    label: 'Enrolments',          icon: 'apply',    href: '/admin/enrolments',    permission: 'PROGRAMMES_VIEW' },
  { key: 'payments',      label: 'Payments',            icon: 'card',     href: '/admin/payments',      permission: 'PAYMENTS_MANAGE' },
  { key: 'products',      label: 'Products & Pricing',  icon: 'tag',      href: '/admin/products',      permission: 'PAYMENTS_MANAGE' },
  { key: 'reports',       label: 'Question Reports',    icon: 'flag',     href: '/admin/reports',       permission: 'BANK_CURATE' },
  { key: 'enquiries',     label: 'Programme Enquiries', icon: 'mail',     href: '/admin/enquiries',     permission: 'PROGRAMMES_VIEW' },
  { key: 'announcements', label: 'Announcements',       icon: 'alert',    href: '/admin/announcements', permission: 'COMMS_MANAGE' },
  { key: 'permissions',   label: 'Admin Permissions',   icon: 'shield',   href: '/admin/permissions',   permission: 'SUPER_ADMIN' },
  { key: 'config',        label: 'System Config',       icon: 'settings', href: '/admin/config',        permission: 'SYSTEM_MANAGE' },
  // Temporary entry for the questions-and-wrappers rebuild sandbox.
  // Removed in Slice 13 (the swap) along with /admin/sandbox/.
  { key: 'authoring-sandbox', label: 'Authoring sandbox', icon: 'edit', href: '/admin/sandbox/authoring', permission: 'BANK_CURATE' },
];

/**
 * Filter ADMIN_NAV by what a user can see.
 *
 *   - SUPER_ADMIN role bypasses every check (sees all 15).
 *   - permission === null / undefined: visible to any admin.
 *   - permission === 'SUPER_ADMIN': sentinel — visible only when the
 *     user holds the SUPER_ADMIN role.
 *   - permission === any other string: visible if the user has that
 *     permission bucket in nclex_admin_permissions.
 *
 * Children inherit their parent's filter result — if the parent is
 * hidden, no children render even if individually permitted. Children
 * that fail their own permission check are dropped while the parent
 * survives (so a partially-permissioned dropdown shows only the
 * sub-items the user can actually reach).
 */
export function filterAdminNav(
  items: NavItem[],
  isSuperAdmin: boolean,
  permissions: string[],
): NavItem[] {
  return items
    .filter((item) => allowed(item, isSuperAdmin, permissions))
    .map((item) => {
      if (!item.children) return item;
      return {
        ...item,
        children: filterAdminNav(item.children, isSuperAdmin, permissions),
      };
    });
}

function allowed(item: NavItem, isSuperAdmin: boolean, permissions: string[]): boolean {
  if (isSuperAdmin) return true;
  if (item.permission == null) return true;
  if (item.permission === 'SUPER_ADMIN') return false;
  return permissions.includes(item.permission);
}
