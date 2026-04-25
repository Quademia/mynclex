// mynclex/app/(app)/tutor/programme/[programme_id]/page.tsx
//
// Landing on a programme without a sub-route sends the tutor to the
// overview page.

import { redirect } from 'next/navigation';

export default async function ProgrammeIndexPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  redirect(`/tutor/programme/${programme_id}/overview`);
}
