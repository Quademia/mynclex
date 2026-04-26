// mynclex/app/programmes/page.tsx
//
// Public listing of tutor programmes. Sits OUTSIDE the (app) route
// group on purpose — anonymous visitors and bank-only students reach
// this from the picker's empty Programme card and from the upsell
// modal's "Browse programmes" button.
//
// Placeholder for now. The real listing lands with the tutored-
// enrolment build. Styled with the public landing-page tokens for
// consistency with the homepage.

import Link from 'next/link';
import '@/styles/landing.css';

export const dynamic = 'force-dynamic';

export default function ProgrammesPage() {
  return (
    <div className="landing">
      <div className="canvas" aria-hidden="true"></div>

      <main>
        <section className="hero">
          <div className="family" aria-label="A QAcademy product">
            <span className="family-dot" aria-hidden="true"></span>
            A QAcademy product
          </div>

          <h1>Tutor Programmes</h1>

          <p className="tagline">
            <strong>Coming soon.</strong> Vetted tutors run structured
            NCLEX-RN prep curricula — week-by-week schedules, live
            sessions, and bundled bank access. The full listing lands
            with the tutored-enrolment build.
          </p>

          <div className="cta">
            <Link href="/" className="cta-secondary">
              Back to home
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div>QAcademy Educational Consult</div>
        <div className="footer-copy">
          © 2026 QAcademy Educational Consult. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
