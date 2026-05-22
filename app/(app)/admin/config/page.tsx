// mynclex/app/(app)/admin/config/page.tsx
//
// System Config — the editable key/value settings (nclex_config). Gated on
// SYSTEM_MANAGE. Reads current values server-side and hands them to the
// client board, which renders the right control per setting type.

import '@/styles/admin-config.css';
import { requireAdminPermission, PERM_SYSTEM_MANAGE } from '@/lib/access';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CONFIG_DEFS } from './config-defs';
import { ConfigBoard, type ConfigItem } from './config-board';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  await requireAdminPermission(PERM_SYSTEM_MANAGE);

  const admin = createServiceRoleClient();
  const { data } = await admin.from('nclex_config').select('key, value');
  const stored = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));

  const items: ConfigItem[] = CONFIG_DEFS.map((def) => ({
    def,
    value: stored.get(def.key) ?? def.defaultValue,
  }));

  return (
    <main className="cfg-page">
      <header className="cfg-head">
        <h1 className="cfg-title">System Config</h1>
        <p className="cfg-sub">
          Platform settings. Setting names are fixed; only their values are editable.
        </p>
      </header>
      <ConfigBoard items={items} />
    </main>
  );
}
