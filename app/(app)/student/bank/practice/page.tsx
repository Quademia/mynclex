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

export const dynamic = 'force-dynamic';

export default async function BankPracticePage() {
  // Per-page bank gate: the layout now admits readiness-only students,
  // so the builder re-asserts bank access (the create-attempt RPC is the
  // hard backstop).
  await requireActiveBankSubscription();
  const [filterOptions, resumable, recents] = await Promise.all([
    getFilterOptions(),
    getResumableAttempt(),
    getRecentAttempts(),
  ]);
  return (
    <PracticeBuilder
      filterOptions={filterOptions}
      resumable={resumable}
      recents={recents}
    />
  );
}
