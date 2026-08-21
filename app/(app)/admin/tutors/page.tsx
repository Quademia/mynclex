// mynclex/app/(app)/admin/tutors/page.tsx
//
// The tutor directory — tutor-onboarding sub-slice 1b. Replaces the
// 20-line <Placeholder> that stood here since the admin nav scaffold.
// Plan: docs/product-plan/tutor-onboarding.md §11; built from the Claude
// Design handoff "Admin — Tutors & Tutor Applications" (2026-08-21).
//
// Answers one question in a glance: who are our tutors, what standing are
// they in, and who let them in. Nothing in the product answered it before
// — the only way to know was to query the database.
//
// Read-only by design. "+ Add tutor" (1c), and suspend/reinstate (1d),
// land on this same page; the directory ships first because it is the
// feedback loop that proves those actions worked.

import { requireAdminPermission, PERM_TUTORS_MANAGE } from '@/lib/access';
import { loadTutorDirectory } from '@/lib/tutors/queries';
import { AdminTutorsBoard } from './admin-tutors-board';

export const dynamic = 'force-dynamic';

export default async function AdminTutorsPage() {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  const { rows, stats } = await loadTutorDirectory();

  return (
    <main className="ao-page">
      <AdminTutorsBoard rows={rows} stats={stats} />
    </main>
  );
}
