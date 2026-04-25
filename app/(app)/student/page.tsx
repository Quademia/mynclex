// mynclex/app/(app)/student/page.tsx
//
// /student has no content of its own — landing on it sends the
// student to the picker, which is the canonical landing surface.
// Old bookmarks pointing to /student keep working.

import { redirect } from 'next/navigation';

export default function StudentIndexPage() {
  redirect('/student/picker');
}
