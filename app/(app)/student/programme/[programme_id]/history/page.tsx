// mynclex/app/(app)/student/programme/[programme_id]/history/page.tsx
//
// Progress engine Slice 4 — programme attempt history page
// (self-paced delivery mode entry point). Sibling to the
// curriculum page; reachable from the programme-detail sidebar.
//
// Two parallel reads (fast — both scoped to this programme + this
// student): the attempts list + the programme's unit_label kind
// (WEEK / MODULE) for the row's unit label.

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProgrammeHistoryAttempts } from '@/lib/practice/history/programme-queries';
import { ProgrammeHistoryTable } from '@/lib/practice/history/programme-history-table';
import type { UnitLabel } from '@/lib/programmes/types';

export const dynamic = 'force-dynamic';

export default async function StudentProgrammeHistoryPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  const supabase = await createClient();

  const [progRes, attempts] = await Promise.all([
    supabase
      .from('nclex_programmes')
      .select('programme_id, title, unit_label')
      .eq('programme_id', programme_id)
      .maybeSingle(),
    getProgrammeHistoryAttempts(programme_id),
  ]);

  if (progRes.error || !progRes.data) notFound();
  const prog = progRes.data;

  return (
    <>
      <header className="hist-head">
        <h1 className="hist-h1">Quiz History</h1>
        <p className="hist-sub">
          Your past attempts in {prog.title}.
        </p>
      </header>
      <ProgrammeHistoryTable
        attempts={attempts}
        unitLabelKind={prog.unit_label as UnitLabel}
      />
    </>
  );
}
