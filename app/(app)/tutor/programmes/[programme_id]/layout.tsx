// mynclex/app/(app)/tutor/programmes/[programme_id]/layout.tsx
//
// Programme-scoped chrome. Replaces the global tutor sidebar with
// the programme sidebar and injects the back pill into the topbar.
// All resolution (programme title lookup, :programmeId substitution
// in nav hrefs) happens inside <TutorProgrammeShell>.

import { TutorProgrammeShell } from '@/components/nav/tutor/programme-shell';

export const dynamic = 'force-dynamic';

export default async function TutorProgrammeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  return (
    <TutorProgrammeShell programmeId={programme_id}>
      {children}
    </TutorProgrammeShell>
  );
}
