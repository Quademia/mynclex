// mynclex/app/(app)/layout.tsx
//
// Slim auth boundary for the authenticated workspace ((app) route
// group covers /student, /tutor, /admin). Two jobs:
//   1. Redirect to /login if there is no authenticated user.
//   2. Import the workspace-wide stylesheets so every authed page
//      inherits the shell tokens, dashboard styles, shell chrome
//      styles, and the new nav.css (sidebars, modal, picker, etc.).
//
// The shell chrome itself (topbar + footer) is NOT rendered here.
// Each audience renders its own <AppShell> via the per-audience
// layout (or page, in the picker's case) so it can pass its own
// productLabel and rightSlot. See lib/shell/load-chrome-data.ts +
// components/shell/app-shell.tsx.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import '@/styles/tokens.css';
import '@/styles/dashboards.css';
import '@/styles/shell.css';
import '@/styles/nav.css';
import '@/styles/authoring.css';
import '@/styles/builder.css';
import '@/styles/runner.css';
// MUST follow runner.css — it is an override layer, not a peer
// (docs/product-plan/runner-mobile.md).
import '@/styles/runner-mobile.css';
import '@/styles/tutorial.css';
import '@/styles/history.css';
// The permanent report for a Builder-built practice sitting — the third
// per-sitting report, beside the readiness pack's and CAT's.
import '@/styles/session-report.css';
import '@/styles/programmes.css';
import '@/styles/cohorts.css';
import '@/styles/strategies.css';
import '@/styles/curriculum.css';
import '@/styles/curriculum-month.css';
import '@/styles/student-curriculum.css';
import '@/styles/student-sessions.css';
import '@/styles/student-home.css';
import '@/styles/media.css';
import '@/styles/quiz.css';
import '@/styles/programme-quizzes.css';
import '@/styles/student-quizzes.css';
import '@/styles/enrolments.css';
import '@/styles/tutor-payments.css';
import '@/styles/enquiries.css';
// The two TUTORS_MANAGE surfaces — the tutor directory and the
// applications queue. `adt-*`.
import '@/styles/admin-tutors.css';
import '@/styles/analytics.css';
import '@/styles/audit.css';
import '@/styles/tutor-home.css';
import '@/styles/programme-overview.css';
import '@/styles/library.css';
import '@/styles/embed-analytics.css';
import '@/styles/student-practice.css';
import '@/styles/profile.css';
import '@/styles/packs.css';
// The student Readiness Packs surface (claim/activate/sit), `rs-*`.
import '@/styles/readiness-student.css';
// The CAT home + its one-shot preflight, `cat-*`.
import '@/styles/cat.css';
// The student Case Study bank (list + run rail), `cb-*`.
import '@/styles/case-bank.css';
// The student Bank Dashboard (the bank home), `bd-*`.
import '@/styles/bank-dashboard.css';
// After packs.css: the admin Products & Pricing surface reuses that
// file's .rp-modal* / .rp-btn-* primitives and adds its own `pr-*`.
import '@/styles/products.css';
// Loaded LAST: the bank LIST-surfaces redesign (Trends / Cases / Question
// Bank). Namespaced `bl-*`; tops the old list rules during the staged
// per-surface migration. See styles/bank-list.css.
import '@/styles/bank-list.css';
// Admin CAT-pool page (slice 10b2) — page-scoped .cp-*, no overlap with the
// bank list above.
import '@/styles/cat-pool.css';
// Loaded after nav.css so its ≤768px breakpoint rules win: the mobile
// navigation chrome (drawer + bottom tabs + account sheet).
import '@/styles/mobile-nav.css';
// The app-wide on-screen calculator widget (`calc-*`), mounted by the
// runner today and any surface that renders <Calculator> later.
import '@/styles/calculator.css';
// The admin email monitor + template preview (`eml-*`). Note: the EMAILS
// themselves are styled inline in lib/email/templates/ — mail clients
// don't support CSS variables, so none of this reaches them.
import '@/styles/email-admin.css';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <>{children}</>;
}
