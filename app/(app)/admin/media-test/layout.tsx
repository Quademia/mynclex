// mynclex/app/(app)/admin/media-test/layout.tsx
//
// Temporary admin route. Wraps the smoke-test page in AdminShell so
// the topbar + sidebar render the same chrome as the rest of the
// admin workspace. The whole folder is removed (or relocated to a
// permanent diagnostics tree) once slice 9.3d-c lights up the PDF-
// activity editor and supersedes the foundation smoke test. Not
// linked from any sidebar — typed directly into the URL.

import { AdminShell } from '@/components/nav/admin/admin-shell';

export const dynamic = 'force-dynamic';

export default function AdminMediaTestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
