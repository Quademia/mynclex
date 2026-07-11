// mynclex/app/(app)/student/bank/packs/page.tsx
//
// The student Readiness Packs surface (Slice ②b.1). Lives inside the
// bank sidebar but adds NO bank-subscription check — the relaxed
// front-door gate (requireBankOrReadiness) already admitted anyone who
// owns a readiness entitlement, so a pack-owner with no bank pass
// reaches this page (the one open door in the bank shell for them).
//
// Server component: reads the per-pack card state (published packs ×
// the student's own credits) and hands it to the client surface, which
// owns the claim interactions. Claim + Claim-all are the only wired
// actions this slice; activation and sitting are later slices.

import { getStudentReadinessView } from '@/lib/payments/readiness-packs-view';
import { ReadinessPacksClient } from './readiness-packs-client';

export const dynamic = 'force-dynamic';

export default async function BankPacksPage() {
  const view = await getStudentReadinessView();
  return <ReadinessPacksClient view={view} />;
}
