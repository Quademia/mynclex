// mynclex/app/(app)/tutor/page.tsx
//
// /tutor has no content of its own — landing on it sends the tutor
// to /tutor/programmes (the global home). Old bookmarks pointing
// at /tutor still work.

import { redirect } from 'next/navigation';

export default function TutorIndexPage() {
  redirect('/tutor/programmes');
}
