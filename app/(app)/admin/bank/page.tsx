// mynclex/app/(app)/admin/bank/page.tsx
//
// /admin/bank has no content of its own — landing on it sends the
// admin to /admin/bank/all (the default sub-page of the Bank ▾
// dropdown).

import { redirect } from 'next/navigation';

export default function AdminBankIndexPage() {
  redirect('/admin/bank/all');
}
