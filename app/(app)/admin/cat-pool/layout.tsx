// mynclex/app/(app)/admin/cat-pool/layout.tsx
//
// /admin/layout.tsx is a role gate only and renders NO chrome — every admin
// sub-folder wraps itself in <AdminShell> (see the note there). Without this
// the page renders bare, with no sidebar or topbar.

import { AdminShell } from '@/components/nav/admin/admin-shell';

export const dynamic = 'force-dynamic';

export default function AdminCatPoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
