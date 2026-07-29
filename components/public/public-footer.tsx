// mynclex/components/public/public-footer.tsx
//
// Shared footer for the (public) route group. Minimal for now —
// consistent with the landing page's footer copy. Carries the discoverable
// link to the public Help hub (/help).

import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="pub-footer">
      <div>QAcademy Educational Consult</div>
      <nav className="pub-footer-links">
        <Link href="/help">Help &amp; guides</Link>
      </nav>
      <div className="pub-footer-copy">
        © 2026 QAcademy Educational Consult. All rights reserved.
      </div>
    </footer>
  );
}
