// mynclex/app/(app)/tutor/programmes/page.tsx
//
// Tutor "Home" — list of programmes the tutor owns or co-runs. Two
// hardcoded demo cards today so the programme context is reachable
// for browser verification. Replace DEMO_PROGRAMMES with a query
// against `nclex_programmes` filtered to tutor_id = auth.uid() once
// that table lands.
//
// TUTOR role gate is in (app)/tutor/layout.tsx; chrome (topbar +
// global sidebar) comes from this folder's layout.tsx via
// <TutorGlobalShell>.

import Link from 'next/link';

export const dynamic = 'force-dynamic';

const DEMO_PROGRAMMES = [
  {
    id: 'demo-bootcamp',
    title: '8-Week NCLEX Bootcamp',
    meta: 'Cohort starting Mon · 12 students · Week 3 of 8',
  },
  {
    id: 'demo-rolling',
    title: 'Self-paced Foundations',
    meta: 'Rolling enrolment · 4 students',
  },
];

export default function TutorProgrammesPage() {
  return (
    <div className="programmes-page">
      <div className="programmes-head">
        <h1 className="programmes-title">Programmes</h1>
        <p className="programmes-sub">
          Programmes you own or co-run. Click a card to enter the
          programme workspace.
        </p>
      </div>
      <div className="programmes-list">
        {DEMO_PROGRAMMES.map((p) => (
          <Link
            key={p.id}
            href={`/tutor/programme/${p.id}/overview`}
            className="programme-card"
          >
            <div>
              <div className="programme-card-title">{p.title}</div>
              <div className="programme-card-meta">{p.meta}</div>
            </div>
            <span className="programme-card-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
