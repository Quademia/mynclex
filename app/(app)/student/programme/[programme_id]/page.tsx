// mynclex/app/(app)/student/programme/[programme_id]/page.tsx
//
// Landing on a programme without a sub-route sends the student to the
// Overview home (the mode-aware programme/cohort dashboard, 2026-06).
// Mirrors the tutor-side programme index → /overview. Was → /curriculum
// before the Overview surface existed.

import { redirect } from 'next/navigation';

export default async function StudentProgrammeIndexPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  redirect(`/student/programme/${programme_id}/overview`);
}
