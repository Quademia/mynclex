// mynclex/app/tutorial/layout.tsx
//
// Public, chrome-less shell for the runner tutorial (Slice 3b).
//
// The tutorial mounts the REAL <Runner> fed a no-writes sandbox bundle,
// and it is deliberately PUBLIC — a logged-out visitor can walk the whole
// thing (see docs/product-plan/runner-tutorial.md -> Slice 3). So it lives
// as a TOP-LEVEL route (like /login, /welcome, /register), NOT under
// (app)/ (whose layout redirects anonymous users) and NOT under (public)/
// (whose layout wraps every child in the public nav + footer — the runner
// wants the whole viewport).
//
// This layout therefore does two things and no more: (1) NO auth boundary,
// (2) import exactly the stylesheets the runner tree needs — tokens (the
// design variables everything else references), the runner itself, the
// coach overlay, and the calculator. Tailwind + fonts come from the root
// layout's globals.css.
//
// force-dynamic: the page reads a per-request `?return=` and must never be
// statically cached.

import '@/styles/tokens.css';
import '@/styles/runner.css';
import '@/styles/tutorial.css';
import '@/styles/calculator.css';

export const dynamic = 'force-dynamic';

export default function TutorialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
