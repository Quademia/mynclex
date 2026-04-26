// mynclex/components/nav/admin/admin-shell.tsx
//
// Server Component wrapper used by every admin sub-folder layout.
// Loads chrome data, fetches the user's permissions, filters
// ADMIN_NAV by what they can see, and renders <AppShell> with
// productLabel="· Admin" plus the filtered sidebar.
//
// The ADMIN/SUPER_ADMIN role check stays in (app)/admin/layout.tsx
// so it runs once per request — this shell trusts the parent gate.
// We re-fetch the user (one extra round-trip) to read the
// nclex_admin_permissions rows for nav filtering. Acceptable cost
// for a single workspace render.

import { createClient } from '@/lib/supabase/server';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { AdminSidebar } from './sidebar';
import { ADMIN_NAV, filterAdminNav } from '@/lib/nav/admin';

export async function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  const supabase = await createClient();
  const { data: permsData } = await supabase
    .from('nclex_admin_permissions')
    .select('permission')
    .eq('user_id', chrome.userId);
  const permissions = (permsData ?? []).map((p) => p.permission as string);

  const isSuperAdmin = chrome.roles.includes('SUPER_ADMIN');
  const visibleItems = filterAdminNav(ADMIN_NAV, isSuperAdmin, permissions);

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Admin"
    >
      <div className="product-layout">
        <AdminSidebar items={visibleItems} totalCount={ADMIN_NAV.length} />
        <main className="product-content">{children}</main>
      </div>
    </AppShell>
  );
}
