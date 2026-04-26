// mynclex/app/(app)/admin/page.tsx
//
// /admin has no content of its own — the dashboard is the canonical
// landing page now (sidebar IS the section menu, so the old hardcoded
// section-card list is obsolete). Old bookmarks pointing at /admin
// still work via this redirect.

import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
