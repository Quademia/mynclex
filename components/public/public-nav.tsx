// mynclex/components/public/public-nav.tsx
//
// Shared top nav for every public page (the (public) route group). The
// full link set from the design handoff is present; Practice bank,
// Programmes, Readiness, For tutors and Log in are wired. The GHS/USD
// currency toggle is an intentional placeholder for a later slice (it
// renders but doesn't do anything yet).
//
// "For tutors" was a dead <span className="link-soon"> from the landing
// page until tutor-onboarding 2a-i (2026-08-22) gave it somewhere to go.
//
// Readiness went live with Slice ①.3 (2026-07-08). Its buy buttons are
// still disabled — the page sells and explains; checkout is Slice ②b.

import Link from 'next/link';

export function PublicNav() {
  return (
    <header className="pub-nav">
      <Link href="/" className="brand">
        <span className="glyph">M</span> MyNclex
      </Link>

      <nav className="links">
        <Link href="/bank-access">Practice bank</Link>
        <Link href="/programmes">Programmes</Link>
        <Link href="/readiness">Readiness</Link>
        <Link href="/for-tutors">For tutors</Link>
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
