// mynclex/app/(app)/student/bank/practice/page.tsx
//
// Practice page — the Builder. Slice 5.1a.
//
// Auth boundary is the bank/layout.tsx STUDENT-role check; this page
// trusts it. The interactive UI lives in <PracticeBuilder/> client
// component; this server component is just the entry shell.

import { PracticeBuilder } from './practice-builder';

export const dynamic = 'force-dynamic';

export default function BankPracticePage() {
  return <PracticeBuilder />;
}
