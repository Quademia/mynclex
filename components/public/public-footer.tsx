// mynclex/components/public/public-footer.tsx
//
// Shared footer for the (public) route group. Minimal for now —
// consistent with the landing page's footer copy. Carries the discoverable
// link to the public Help hub (/help).

import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="pub-footer">
      <div>Quademia</div>
      <nav className="pub-footer-links">
        <Link href="/help">Help &amp; guides</Link>
      </nav>
      {/* ⚠ "Quademia", plainly — the company renamed and QAcademy is not
          the registered name (Sam, 2026-08-22). A copyright line is the
          one place a fuller legal name would normally sit, which is why
          it was asked rather than assumed. */}
      <div className="pub-footer-copy">
        © 2026 Quademia. All rights reserved.
      </div>
    </footer>
  );
}
