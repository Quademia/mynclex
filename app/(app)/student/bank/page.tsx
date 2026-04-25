// mynclex/app/(app)/student/bank/page.tsx
//
// /student/bank has no content of its own — landing on it sends the
// student to the dashboard sub-route.

import { redirect } from 'next/navigation';

export default function BankIndexPage() {
  redirect('/student/bank/dashboard');
}
