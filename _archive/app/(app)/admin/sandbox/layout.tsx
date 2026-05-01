// mynclex/app/(app)/admin/sandbox/layout.tsx
//
// Admin sandbox layout — wraps every page under /admin/sandbox in
// <AdminShell> so the sidebar + topbar render. Mirrors the same
// pattern as /admin/bank/layout.tsx.
//
// Sandbox routes are temporary: they exist for slice-1-style file-shape
// proofs of the questions-and-wrappers rebuild. Removed in Slice 13
// (the swap) along with the corresponding nav entry.

import { AdminShell } from '@/components/nav/admin/admin-shell';

export const dynamic = 'force-dynamic';

export default function AdminSandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
