// mynclex/app/(app)/admin/config/actions.ts
//
// Save a system-config value. Gated on SYSTEM_MANAGE in TS; the write runs
// via the service role (nclex_config's RLS only allows SUPER_ADMIN to write,
// but the SYSTEM_MANAGE permission bucket is the real gate for this surface).
// The value is validated against its def first, so a typo can't break the
// feature that reads it.

'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission, PERM_SYSTEM_MANAGE } from '@/lib/access';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { configDef, validateConfigValue } from './config-defs';

export type UpdateConfigResult = { ok: true } | { ok: false; error: string };

export async function updateConfigAction(
  key: string,
  value: string
): Promise<UpdateConfigResult> {
  await requireAdminPermission(PERM_SYSTEM_MANAGE);

  const def = configDef(key);
  if (!def) return { ok: false, error: 'Unknown setting.' };

  const checked = validateConfigValue(def, value);
  if (!checked.ok) return { ok: false, error: checked.error };

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('nclex_config')
    .upsert(
      { key, value: checked.value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) {
    console.error('config update failed:', error.message);
    return { ok: false, error: 'Could not save this setting. Please try again.' };
  }

  revalidatePath('/admin/config');
  return { ok: true };
}
