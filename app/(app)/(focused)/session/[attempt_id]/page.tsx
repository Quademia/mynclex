// mynclex/app/(app)/(focused)/session/[attempt_id]/page.tsx
//
// Stub for the runner. Slice 5.1a temporarily lands attempts here;
// slice 4.1 will replace this whole route with the real runner shell
// (preflight → Q1 → answer → submit → review).
//
// What this stub does:
//   - Verifies the attempt exists and belongs to the signed-in student
//     (RLS handles it — a non-owning student gets 0 rows).
//   - Shows a "Quiz built · runner coming next slice" card with the
//     attempt id, requested count, mode, intent, and a Discard button
//     wired to nclex_discard_attempt.
//   - On Discard, navigates back to /student/bank/practice/.

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SessionStub } from './session-stub';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attempt_id: string }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { attempt_id } = await params;
  const supabase = await createClient();

  const { data: attempt, error } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, status, intent, mode, requested_question_count, actual_question_count, actual_unit_count, started_at, created_at'
    )
    .eq('attempt_id', attempt_id)
    .maybeSingle();

  if (error || !attempt) notFound();

  // Quick item count for the stub display (not strictly needed but nice
  // to confirm snapshots materialised).
  const { count: itemCount } = await supabase
    .from('nclex_attempt_items')
    .select('*', { count: 'exact', head: true })
    .eq('attempt_id', attempt_id);

  return (
    <SessionStub
      attempt={attempt as Attempt}
      itemCount={itemCount ?? 0}
    />
  );
}

interface Attempt {
  attempt_id: string;
  status: string;
  intent: string;
  mode: string;
  requested_question_count: number;
  actual_question_count: number;
  actual_unit_count: number;
  started_at: string | null;
  created_at: string;
}
