// mynclex/app/(app)/tutor/programme/[programme_id]/layout.tsx
//
// Programme-scoped chrome. Sibling subtree to /tutor/programmes/
// (the list) — using singular vs plural to keep them as separate
// worlds rather than parent-and-child. Renders its own AppShell so
// the global tutor topbar/footer don't double-render on programme
// pages. All resolution (programme title lookup, :programmeId
// substitution in nav hrefs) happens inside <TutorProgrammeShell>.

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
