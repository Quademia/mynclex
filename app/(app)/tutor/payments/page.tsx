// mynclex/app/(app)/tutor/payments/page.tsx
//
// The global tutor Payments page — one ledger of every student payment
// across ALL the tutor's programmes ("what money came in?"), filterable
// by programme · cohort · channel · status · date. Built ONCE globally
// (no per-programme money pages) per payments-and-enrolment.md
// "Settled 2026-06-12 — tutor money surfaces (IA)".
//
// The parent payments/layout.tsx already wraps this in
// <TutorGlobalShell>, so the page just fetches + renders the view.
// Data: getTutorPayments() (lib/payments/tutor/queries) — programme-fee
// payments only, received + refunded, no migration.

import { getTutorPayments } from '@/lib/payments/tutor/queries';
import { TutorPaymentsView } from '@/lib/payments/tutor/tutor-payments-view';

export const dynamic = 'force-dynamic';

export default async function TutorPaymentsPage() {
  const { rows, cohorts } = await getTutorPayments();
  return <TutorPaymentsView rows={rows} cohorts={cohorts} />;
}
