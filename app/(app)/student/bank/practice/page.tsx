// mynclex/app/(app)/student/bank/practice/page.tsx
//
// Practice page — the Builder.
//
// Auth boundary is the bank/layout.tsx STUDENT-role check; this page
// trusts it. The interactive UI lives in <PracticeBuilder/> client
// component; this server component fetches three pieces of SSR data
// in parallel:
//   1. The dynamic filter-axis options (tags, topics, subtopics) from
//      the published bank.
//   2. The most-recent unfinished STUDY attempt, if any (Resume
//      banner). Null when there's nothing to resume.
//   3. The last 3 finished attempts (Recent Quizzes shortcut). Empty
//      array when the student has no history yet.

import { PracticeBuilder } from './practice-builder';
import { requireActiveBankSubscription } from '@/lib/access';
import { getFilterOptions } from '@/lib/practice/builder/get-filter-options';
import { getResumableAttempt } from '@/lib/practice/launchers/get-resumable-attempt';
import { getRecentAttempts }  from '@/lib/practice/launchers/get-recent-attempts';
import type { FilterPayload } from '@/lib/practice/builder/types';

export const dynamic = 'force-dynamic';

/** A deep-link (e.g. the readiness report's "practise this category") may
 *  pre-seed the content filters via query params. Only the content axes are
 *  honoured — pools stay UNSEEN so practice serves fresh questions. */
function initialFiltersFromParams(
  sp: Record<string, string | string[] | undefined>,
): FilterPayload | undefined {
  const arr = (v: string | string[] | undefined): string[] | undefined =>
    Array.isArray(v) ? v : v ? [v] : undefined;
  const payload: FilterPayload = {
    client_needs_category: arr(sp.cnc),
    client_needs_subcategory: arr(sp.subcat),
    body_system: arr(sp.body),
    difficulty: arr(sp.diff),
  };
  const any = Object.values(payload).some((v) => v && v.length);
  return any ? payload : undefined;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BankPracticePage({ searchParams }: PageProps) {
  // Per-page bank gate: the layout now admits readiness-only students,
  // so the builder re-asserts bank access (the create-attempt RPC is the
  // hard backstop).
  await requireActiveBankSubscription();
  const [sp, filterOptions, resumable, recents] = await Promise.all([
    searchParams,
    getFilterOptions(),
    getResumableAttempt(),
    getRecentAttempts(),
  ]);
  return (
    <PracticeBuilder
      filterOptions={filterOptions}
      resumable={resumable}
      recents={recents}
      initialFilters={initialFiltersFromParams(sp)}
    />
  );
}
