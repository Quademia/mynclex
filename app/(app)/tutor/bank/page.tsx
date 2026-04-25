// mynclex/app/(app)/tutor/bank/page.tsx
//
// /tutor/bank has no content of its own — landing on it sends the
// tutor to /tutor/bank/all (the default sub-page of the My Bank
// dropdown).

import { redirect } from 'next/navigation';

export default function TutorBankIndexPage() {
  redirect('/tutor/bank/all');
}
