// mynclex/lib/home/student/bank/resume-banner.tsx
//
// Card 4 — "Pick up where you left off".
//
// The title is the MODE, not a subject. The design showed
// "Pharmacology · Untimed practice", but a bank quiz is assembled from
// filters and frequently spans several subjects — there is no single
// topic to name, so naming one would be fiction. What is true and
// useful: which kind of session it was, how far in you are, and when
// you left it.
//
// Resume only. "Start fresh" / discard is destructive and stays on the
// practice page, where the consequence is spelled out.

import Link from 'next/link';
import type { ResumeCard } from './types';

export function ResumeBanner({ resume }: { resume: ResumeCard }) {
  return (
    <section className="bd-card bd-resume" aria-label="Unfinished session">
      <span className="bd-resume-icon" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <div className="bd-resume-body">
        <span className="bd-eyebrow">Pick up where you left off</span>
        <h2 className="bd-resume-title">{resume.modeLabel}</h2>
        <p className="bd-resume-meta">
          {`${resume.done} of ${resume.total} questions${
            resume.savedWhen ? ` · saved ${resume.savedWhen}` : ''
          } · progress saved automatically`}
        </p>
      </div>
      <Link className="bd-btn" href={resume.href}>
        Resume quiz →
      </Link>
    </section>
  );
}
