// mynclex/app/(app)/tutor/programmes/page.tsx
//
// Tutor "Home" — list of programmes the tutor owns. Real DB-backed
// list (slice 9.1a) + functional New Programme modal (slice 9.1b).
// Co-tutored programmes deferred until the co-tutor join table lands.
//
// TUTOR role gate is in (app)/tutor/layout.tsx; chrome (topbar +
// global sidebar) comes from this folder's layout.tsx via
// <TutorGlobalShell>.

import { getMyProgrammesForList } from '@/lib/programmes/queries';
import { ProgrammeList } from '@/lib/programmes/programme-list';
import { ProgrammesEmpty } from '@/lib/programmes/empty-state';
import { NewProgrammeTrigger } from '@/lib/programmes/new-programme-trigger';

export const dynamic = 'force-dynamic';

export default async function TutorProgrammesPage() {
  const programmes = await getMyProgrammesForList();

  return (
    <div className="programmes-page">
      <header className="programmes-head">
        <div>
          <h1 className="programmes-title">Programmes</h1>
          <p className="programmes-sub">
            Every programme you run — manage cohorts, pricing and publishing.
          </p>
        </div>
        {programmes.length > 0 && <NewProgrammeTrigger variant="header" />}
      </header>

      {programmes.length === 0 ? (
        <ProgrammesEmpty />
      ) : (
        <ProgrammeList programmes={programmes} />
      )}
    </div>
  );
}
