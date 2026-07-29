// mynclex/app/tutorial/exam/page.tsx
//
// The exam runner tutorial (sandbox). See docs/product-plan/runner-tutorial.md.
//
// URL is /tutorial/exam. `tutorial` is deliberately a NAMESPACE, not a
// page — future walkthroughs (the builder, the dashboard, onboarding) get
// their own /tutorial/<slug> sibling rather than crowding one greedy route.
//
// This route mounts the REAL <Runner> — the exact same component that runs
// a live exam — fed an in-memory, no-writes bundle (buildSandboxData). It
// creates no attempt row and calls no server action on render, so a full
// walk-through leaves the database untouched (the Slice 1 sign-off). The
// ONLY write anywhere in the feature is the completion record the coach
// fires at the final step, and that no-ops for a logged-out visitor.
//
// PUBLIC route (Slice 3b): it lives top-level (not under (app)/), so it is
// reachable logged-out. `?return=` names where End / Exit / Finish send the
// student back to; it is sanitized in buildSandboxData (internal-only).

import { Runner } from '@/app/(app)/(focused)/session/[attempt_id]/runner';
import { buildSandboxData } from '@/lib/practice/tutorial/sandbox-data';

export const dynamic = 'force-dynamic';

export default async function ExamTutorialPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string | string[] }>;
}) {
  const sp = await searchParams;
  const returnTo = Array.isArray(sp.return) ? sp.return[0] : sp.return;
  const data = buildSandboxData(returnTo);
  return <Runner data={data} />;
}
