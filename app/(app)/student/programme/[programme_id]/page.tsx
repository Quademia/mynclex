// mynclex/app/(app)/student/programme/[programme_id]/page.tsx
//
// Landing on a programme without a sub-route sends the student to
// the curriculum tab. Mirrors the tutor-side programme index
// redirect (→ /overview); the student's equivalent landing is the
// curriculum because that's the only tab in 10.1.

import { redirect } from 'next/navigation';

export default async function StudentProgrammeIndexPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  redirect(`/student/programme/${programme_id}/curriculum`);
}
