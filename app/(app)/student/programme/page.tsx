// mynclex/app/(app)/student/programme/page.tsx
//
// /student/programme has no content of its own — landing on it sends
// the student to the overview sub-route.

import { redirect } from 'next/navigation';

export default function ProgrammeIndexPage() {
  redirect('/student/programme/overview');
}
