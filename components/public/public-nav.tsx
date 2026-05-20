// mynclex/components/public/public-nav.tsx
//
// Shared top nav for every public page (the (public) route group). The
// full link set from the design handoff is present; only Programmes +
// Log in are wired today. Practice bank / Readiness / For tutors and the
// GHS/USD currency toggle are intentional placeholders for later slices
// (they render but don't navigate / do anything yet).

import Link from 'next/link';

export function PublicNav() {
  return (
    <header className="pub-nav">
      <Link href="/" className="brand">
        <span className="glyph">M</span> MyNclex
      </Link>

      <nav className="links">
        <span className="link-soon">Practice bank</span>
        <Link href="/programmes">Programmes</Link>
        <span className="link-soon">Readiness</span>
        <span className="link-soon">For tutors</span>
      </nav>

      <div className="right">
        {/* Placeholder — currency switching lands with on-platform
            checkout (Slice 5/6). Inert for now. */}
        <div className="fx-toggle" aria-hidden="true">
          <button type="button" className="on" tabIndex={-1}>
            GHS
          </button>
          <button type="button" tabIndex={-1}>
            USD
          </button>
        </div>
        <Link href="/login" className="pub-btn-ghost">
          Log in
        </Link>
      </div>
    </header>
  );
}
