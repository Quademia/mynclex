// mynclex/app/(public)/programmes/page.tsx
//
// Public discovery list. Server component — fetches published
// programmes through the public view (lib/discovery) and hands them to
// the client list for filtering. Replaces the old standalone
// /programmes placeholder, now grouped under (public) with shared
// chrome.

import { getDiscoveryProgrammes } from '@/lib/discovery/queries';
import { ProgrammesList } from './programmes-list';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Programmes — MyNclex',
  description:
    'Vetted tutored NCLEX-RN prep programmes — tutor-led cohorts and self-paced courses.',
};

export default async function ProgrammesPage() {
  const programmes = await getDiscoveryProgrammes();

  return (
    <main className="pub-content">
      <div className="disc-hero">
        <div className="kicker">Vetted tutored programmes · NCLEX-RN</div>
        <h1>Programmes from tutors who&rsquo;ve done this before</h1>
        <p>
          Tutor-led intensives and self-paced courses for internationally
          trained nurses preparing for the NCLEX-RN. Pick a tutor, pick a
          cohort — QAcademy hosts the content.
        </p>
      </div>

      {programmes.length === 0 ? (
        <p className="disc-empty">
          No programmes are open right now. Check back soon.
        </p>
      ) : (
        <ProgrammesList programmes={programmes} />
      )}
    </main>
  );
}
