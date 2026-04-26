import { AdminShell } from '@/components/nav/admin/admin-shell';

export const dynamic = 'force-dynamic';

export default function AdminApplicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
