// mynclex/app/(app)/(focused)/tutorial/exam/page.tsx
//
// The exam runner tutorial (sandbox). See docs/product-plan/runner-tutorial.md.
//
// URL is /tutorial/exam. `tutorial` is deliberately a NAMESPACE, not a
// page — future walkthroughs (the builder, the dashboard, onboarding) get
// their own /tutorial/<slug> sibling rather than crowding one greedy route.
//
// This route mounts the REAL <Runner> — the exact same component that runs
// a live exam — fed an in-memory, no-writes bundle (buildSandboxData). It
// creates no attempt row and calls no server action, so a full walk-through
// leaves the database untouched (the Slice 1 sign-off).
//
// It lives under (app)/(focused) so it inherits (a) the auth boundary from
// the (app) layout — v1 is an authenticated route — and (b) the
// distraction-free focused frame the session runner already uses. No bank
// subscription gate: the tutorial is free teaching, open to any signed-in
// user.

import { Runner } from '../../session/[attempt_id]/runner';
import { buildSandboxData } from '@/lib/practice/tutorial/sandbox-data';

export const dynamic = 'force-dynamic';

export default function ExamTutorialPage() {
  const data = buildSandboxData();
  return <Runner data={data} />;
}
