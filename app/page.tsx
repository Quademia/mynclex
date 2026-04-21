import Link from "next/link";
import "./landing.css";

export default function Home() {
  return (
    <>
      <div className="canvas" aria-hidden="true"></div>

      <main>
        <section className="hero">
          <div className="family" aria-label="A QAcademy product">
            <span className="family-dot" aria-hidden="true"></span>
            A QAcademy product
          </div>

          <div className="status" aria-label="Launch status: launching 2026">
            <span className="status-pulse" aria-hidden="true"></span>
            Launching 2026
          </div>

          <h1>
            <span className="my">My</span><span className="nclex">Nclex</span><span className="rn">-RN</span>
          </h1>

          <p className="tagline">
            NCLEX-RN exam prep for internationally-trained nurses.
          </p>

          <div className="brand-tag" aria-hidden="true">
            LEARN <span className="sep">·</span> PRACTICE <span className="sep">·</span> PASS
          </div>

          <div className="preview" aria-label="What's coming">
            <span className="preview-label">What&apos;s coming</span>
            <div className="preview-item">
              <div className="preview-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
              <div className="preview-text">
                <strong>Full NCLEX-RN question bank</strong>
                Curated practice questions with rationales for self-study.
              </div>
            </div>
            <div className="preview-item">
              <div className="preview-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div className="preview-text">
                <strong>Live tutor-led sessions</strong>
                Vetted tutors guiding you through your NCLEX journey.
              </div>
            </div>
          </div>

          <div className="cta">
            <Link href="/register" className="cta-primary">
              Create account
            </Link>
            <Link href="/login" className="cta-secondary">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div>QAcademy Educational Consult</div>
        <div className="footer-copy">© 2026 QAcademy Educational Consult. All rights reserved.</div>
      </footer>
    </>
  );
}
