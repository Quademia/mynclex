'use client';

// mynclex/components/public/public-nav.tsx
//
// Shared top nav for every public page (the (public) route group),
// rendered once by app/(public)/layout.tsx.
//
// ⭐ ONE COMPONENT, ONE LINK LIST (Sam, 2026-08-22). Desktop shows the
// row; ≤768px the same list becomes a drawer behind a hamburger. Two
// components would mean two lists that drift — add "Sign up" later and
// you would edit one and forget the other, which is exactly what
// CLAUDE.md's convention #4 exists to prevent for lib/nav.
//
// ⚠⚠ WHY THIS EXISTS AT ALL: below the breakpoint the link row used to
// be `display: none` with nothing replacing it, so on a phone the ONLY
// public links were the brand, Log in, and Help in the footer.
// /bank-access and /programmes survived by luck (the landing page links
// them in its body); **/readiness and /for-tutors had no entry point in
// the entire product** — reachable only by typing the URL, on a
// phone-first audience, one of them a product we sell and the other the
// tutor door. Found 2026-08-22.
//
// ⓘ It is 'use client' now, which costs nothing here: this component has
// no server data, only static markup and <Link>s.
//
// ⚠ THE DRAWER'S STYLES ARE `pub-` PREFIXED AND LIVE IN discovery.css —
// deliberately NOT the app's `m-*` drawer (Sam, 2026-08-22). Reuse would
// have *worked* (the app tokens resolve here and its risky rules are
// scoped to .shell-root), which is what made it tempting and wrong: the
// public site is a ported design system with its own token vocabulary
// bridged on .pub-shell, and it is the half most likely to be re-cut by
// Claude Design later. Coupling it to the authenticated workspace's
// stylesheet would let a change to one silently move the other. They are
// also different objects — that drawer is a navigation TREE (sections,
// collapsible parents, badges, a user bar); this one is five links.
//
// ⭐ What IS reused is the BEHAVIOUR, copied from
// components/shell/mobile/mobile-nav.tsx — close on route change (during
// render, not in an effect), Escape, body scroll lock, focus into the
// panel, and close if the viewport grows past the breakpoint. Those are
// the parts that get forgotten, and they were worked out once already.
//
// ⓘ The GHS/USD toggle that used to sit here is GONE (Sam, 2026-08-22).
// It was inert — tabIndex={-1}, aria-hidden, no handler — and duplicated
// a control that already works on the purchasing surfaces as `.bkc-fx`,
// next to the prices it changes. A currency switch in a global nav
// implies it affects the whole site; it only ever affected two plan
// lists.
//
// "For tutors" was a dead <span className="link-soon"> until
// tutor-onboarding 2a-i (2026-08-22) gave it somewhere to go.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** The single source of truth for public navigation.
 *  `drawerOnly` keeps the desktop bar to the four product links while
 *  the drawer stays the COMPLETE menu — same idea as the app's. */
const LINKS: { href: string; label: string; drawerOnly?: boolean }[] = [
  { href: '/bank-access', label: 'Practice bank' },
  { href: '/programmes', label: 'Programmes' },
  { href: '/readiness', label: 'Readiness' },
  { href: '/for-tutors', label: 'For tutors' },
  { href: '/help', label: 'Help & guides', drawerOnly: true },
];

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close when the route changes (they tapped a link). Adjusted during
  // render rather than in an effect — the pattern the app's drawer uses,
  // which avoids the cascading-render set-state-in-effect path.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Lock the page behind the drawer.
  useEffect(() => {
    document.body.classList.toggle('pub-nav-locked', open);
    return () => document.body.classList.remove('pub-nav-locked');
  }, [open]);

  // Land keyboard and screen-reader users inside the panel.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // ⚠ If the viewport grows past the breakpoint while it is open, close
  // it — the hamburger that controls it is display:none on desktop, so
  // a lingering-open drawer would be stranded with no way to dismiss it.
  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 768) setOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      <header className="pub-nav">
        <Link href="/" className="brand">
          <span className="glyph">M</span>
          {/* ⭐ PRODUCT-DOMINANT, the inverse of UWorld's parent-first
              lockup (Sam, 2026-08-22). They lead with the parent because
              UWorld is the half with the recognition; ours is inverted —
              a nurse may come to hear of MyNclex, nobody searches for
              Quademia. But the parent still earns its line: Google's
              consent screen names quademia.com, so a visitor who taps
              "Continue with Google" should already have read the word.
              ⓘ Says what the landing page's chip says, rather than
              inventing a third phrasing. */}
          <span className="brand-text">
            <span className="brand-name">MyNclex</span>
            <span className="brand-parent">by Quademia</span>
          </span>
        </Link>

        <nav className="links">
          {LINKS.filter((l) => !l.drawerOnly).map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="right">
          <Link href="/login" className="pub-btn-ghost">
            Log in
          </Link>
          {/* ⓘ Right-hand side, and the drawer slides from the right to
              match: on a phone held one-handed that is where the thumb
              rests. ⚠ The app's authenticated drawer opens from the LEFT
              — a deliberate divergence, and if the two are ever aligned
              it is that one that should move. */}
          <button
            type="button"
            className="pub-burger"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </button>
        </div>
      </header>

      <div
        className={open ? 'pub-backdrop is-open' : 'pub-backdrop'}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* `inert` when closed, not aria-hidden: it hides the panel from
          assistive tech AND takes its links out of the tab order, so a
          keyboard user cannot tab into an off-screen drawer. */}
      <aside className={open ? 'pub-drawer is-open' : 'pub-drawer'} aria-label="Menu" inert={!open}>
        <div className="pub-drawer-head">
          <span className="pub-drawer-brand">
            MyNclex <span className="pub-drawer-parent">by Quademia</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            className="pub-burger"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="pub-drawer-nav" aria-label="Site">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="pub-drawer-link">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* ⚠ The only conversion action on the public site, so it is a
            button at the foot of the drawer rather than a sixth link in
            the list. */}
        <Link href="/login" className="pub-drawer-login">
          Log in
        </Link>
      </aside>
    </>
  );
}
