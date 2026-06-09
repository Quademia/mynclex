// mynclex/app/(app)/tutor/programmes/page.tsx
//
// Tutor "My Programmes" — list of programmes the tutor owns, split at the
// front into Tutored / Self-paced (same nclex_programmes table underneath;
// see lib/programmes/programme-list.tsx). Real DB-backed list + the
// functional create / edit modal.
//
// TUTOR role gate is in (app)/tutor/layout.tsx; chrome (topbar +
// global sidebar) comes from this folder's layout.tsx via
// <TutorGlobalShell>. The page body (header, mode segment, toolbar,
// grid, empty states) lives in the client <ProgrammeList>.

import { getMyProgrammesForList } from '@/lib/programmes/queries';
import { ProgrammeList } from '@/lib/programmes/programme-list';

export const dynamic = 'force-dynamic';

export default async function TutorProgrammesPage() {
  const programmes = await getMyProgrammesForList();
  return <ProgrammeList programmes={programmes} />;
}
