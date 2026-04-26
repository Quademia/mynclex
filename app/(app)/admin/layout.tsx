// mynclex/app/(app)/admin/layout.tsx
//
// ADMIN/SUPER_ADMIN role gate for the entire /admin tree. Renders no
// chrome — each admin sub-folder owns its own chrome via <AdminShell>
// (which loads chrome data, filters the sidebar by permissions, and
// wraps in <AppShell> with productLabel="· Admin"). This mirrors the
// tutor pattern from slice 2.7.
//
// History:
//   - Slice 2.6 had this layout render <AppShell> directly.
//   - Slice 2.8 (admin nav scaffold) reverted that so each context
//     can own its chrome without double-rendering.
//   - Slice 2.9 (lib/auth foundation) replaced the inline 12-line
//     role gate with a single requireAnyAdmin() call.

import { requireAnyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyAdmin();
  return <>{children}</>;
}
