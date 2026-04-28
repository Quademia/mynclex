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
