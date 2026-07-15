// mynclex/app/(public)/layout.tsx
//
// Public site shell. Owns the chrome (nav + footer) every public page
// shares — the anonymous-visitor counterpart to (app)/layout.tsx. No
// auth boundary: these pages are reachable logged-out. Data is read
// through the public views, so no per-user caching concerns.
//
// The landing page (app/page.tsx) keeps its own self-contained header
// for now; it can migrate into this group later.

import '@/styles/tokens.css';
import '@/styles/discovery.css';
import '@/styles/checkout.css';
import '@/styles/bank-public.css';
import '@/styles/readiness-public.css';
import '@/styles/programmes-public.css';
import { PublicNav } from '@/components/public/public-nav';
import { PublicFooter } from '@/components/public/public-footer';

export const dynamic = 'force-dynamic';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pub-shell">
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}
