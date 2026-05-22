// mynclex/app/(public)/page.tsx
//
// Public homepage. Lives in the (public) group, so it inherits the shared
// PublicNav + PublicFooter (the old standalone app/page.tsx teaser was
// rebuilt into this — Slice 5.x housekeeping). A dark hero band sits
// directly under the light nav for brand drama, then light sections route
// visitors into the two products (bank + programmes). "Launching 2026"
// stays as the honest status while the build continues.

import Link from 'next/link';
import '@/styles/home.css';

export default function HomePage() {
  return (
    <>
      <section className="home-hero">
        <div className="home-hero-bg" aria-hidden="true" />
        <div className="home-hero-inner">
          <div className="home-family" aria-label="A QAcademy product">
            <span className="home-family-dot" aria-hidden="true" />
            A QAcademy product
          </div>

          <div className="home-status" aria-label="Launch status: launching 2026">
            <span className="home-status-pulse" aria-hidden="true" />
            Launching 2026
          </div>

          <h1 className="home-title">
            <span className="my">My</span>
            <span className="nclex">Nclex</span>
            <span className="rn">-RN</span>
          </h1>

          <p className="home-tagline">
            NCLEX-RN exam prep for internationally-trained nurses.
          </p>

          <div className="home-cta">
            <Link href="/programmes" className="home-cta-primary">
              Explore programmes
            </Link>
            <Link href="/bank-access" className="home-cta-secondary">
              Practice bank
            </Link>
          </div>

          <p className="home-cta-note">
            New here? <Link href="/register">Create an account →</Link>
          </p>
        </div>
      </section>

      <main className="pub-content home-content">
        <section className="home-offer">
          <div className="home-offer-eyebrow">TWO WAYS TO PREPARE</div>
          <h2>Self-study, tutor-led, or both.</h2>
          <p className="home-offer-lede">
            MyNclex pairs a QAcademy-built NCLEX-RN question bank with structured
            programmes run by vetted tutors. Use either on its own — or together.
          </p>

          <div className="home-offer-grid">
            <Link href="/bank-access" className="home-offer-card">
              <div className="home-offer-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <h3>The Practice Bank</h3>
              <p>
                A self-study NCLEX-RN question bank — every NGN item type, a worked
                rationale on every question, practice &amp; exam modes. Buy by the
                duration that fits your timeline.
              </p>
              <span className="home-offer-link">Practice bank →</span>
            </Link>

            <Link href="/programmes" className="home-offer-card">
              <div className="home-offer-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Tutored Programmes</h3>
              <p>
                Structured week-by-week prep run by vetted tutors — live sessions,
                pre/post-tutorial tasks, and a curriculum built around the bank.
                Enrol in a cohort that suits you.
              </p>
              <span className="home-offer-link">Browse programmes →</span>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
