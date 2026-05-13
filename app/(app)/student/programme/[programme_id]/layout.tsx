// mynclex/app/(app)/student/programme/[programme_id]/layout.tsx
//
// Slice 10.1 — student programme-detail layout. Sibling to
// /student/programmes (the list) per folder convention #7;
// singular for the detail subtree.
//
// All resolution (STUDENT gate, programme RLS-readability, sidebar
// :programmeId substitution) happens inside <StudentProgrammeShell>.

import { StudentProgrammeShell } from '@/components/nav/student/programme-shell';

export const dynamic = 'force-dynamic';

export default async function StudentProgrammeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  return (
    <StudentProgrammeShell programmeId={programme_id}>
      {children}
    </StudentProgrammeShell>
  );
}
