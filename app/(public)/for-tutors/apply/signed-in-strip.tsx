// mynclex/app/(public)/for-tutors/apply/signed-in-strip.tsx
//
// "You are signed in as …, and here is the way out."
//
// ⭐ WHY THIS PAGE NEEDS IT AND OTHER PUBLIC PAGES DO NOT (Sam,
// 2026-08-22). For an applicant with no role, THIS ROUTE IS THE WHOLE
// PRODUCT: /router sends them here, there is no sidebar, no account menu
// and nowhere else to go. Before this strip they saw "your application is
// with us" above a nav button inviting them to Log in — which they
// already were — with no way to sign out and no indication of which
// account they were even looking at.
//
// ⚠ WHY IT IS NOT A SESSION-AWARE PUBLIC NAV, which would fix it
// everywhere at once. Checked rather than assumed: every public page
// answers `Cache-Control: no-cache, must-revalidate` — no `private` — so
// putting a name in the shared nav would put per-user content on every
// marketing page behind a header that does not say it is per-user. That
// is its own change with its own headers to sort out. This route is
// already force-dynamic and already renders the caller's own
// application, so session UI here changes nothing about how it is
// cached.
//
// ⓘ Sign-out posts. /logout is POST-only by design, "to protect against
// accidental sign-outs from GET navigations" — so this is a form, not a
// link, and it is the reason this component exists at all rather than
// being two anchors in the page.

import Link from 'next/link';

export function SignedInStrip({
  email,
  /**
   * Whether they hold any role. An applicant holds NONE, and for them
   * there is genuinely nowhere else in the product — so the "go to my
   * account" link is absent rather than pointing at a door that would
   * bounce them straight back here.
   */
  hasSomewhereToGo,
}: {
  email: string;
  hasSomewhereToGo: boolean;
}) {
  return (
    <div className="ft-whoami">
      <span className="ft-whoami-label">
        Signed in as <strong>{email}</strong>
      </span>

      <span className="ft-whoami-actions">
        {hasSomewhereToGo && (
          <Link href="/router" className="ft-linkish">
            Go to my account
          </Link>
        )}
        <form action="/logout" method="post">
          <button type="submit" className="ft-linkish">
            Sign out
          </button>
        </form>
      </span>
    </div>
  );
}
