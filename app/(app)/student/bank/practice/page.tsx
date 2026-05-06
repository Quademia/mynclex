// mynclex/app/(app)/student/bank/practice/page.tsx
//
// Practice page — the Builder. Slice 5.1a + 5.1d.
//
// Auth boundary is the bank/layout.tsx STUDENT-role check; this page
// trusts it. The interactive UI lives in <PracticeBuilder/> client
// component; this server component fetches the dynamic filter axis
// options (tags, topics, subtopics) at SSR time and passes them in.

import { PracticeBuilder } from './practice-builder';
import { getFilterOptions } from '@/lib/bank/builder/get-filter-options';

export const dynamic = 'force-dynamic';

export default async function BankPracticePage() {
  const filterOptions = await getFilterOptions();
  return <PracticeBuilder filterOptions={filterOptions} />;
}
