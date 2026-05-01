// mynclex/lib/authoring/wrappers/trend/actions.ts
//
// Server actions for the trend wrapper-v2 build (slice 13).
//
// 13a ships only createTrendAction — the kind-picker create flow.
// saveTrendMetadataAction lands in 13c, detachQuestionAction in 13e,
// deleteTrendAction in 13e. Per decision 4, all of these stay as
// direct CRUD; the legacy nclex_save_trend_with_children RPC and the
// two delete RPCs go unused by v2 code (slated for cleanup post
// slice 14).
//
// Surface-aware: branches between admin (nclex_trend_datasets) and
// tutor (nclex_tutor_trend_datasets). Same readSurface convention as
// case-study v2 actions.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireBankCurator, type ServerSupabaseClient } from '@/lib/access';
import {
  TREND_ID_PREFIX,
  TUTOR_TREND_ID_PREFIX,
} from '../../classifications';
import { kindSeedData } from './kind-templates';
import type { Surface } from './types';

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

interface SurfaceConfig {
  table:    'nclex_trend_datasets' | 'nclex_tutor_trend_datasets';
  baseUrl:  '/admin/bank/trends-v2' | '/tutor/bank/trends-v2';
  idPrefix: string;
}

function configFor(surface: Surface): SurfaceConfig {
  if (surface === 'tutor') {
    return {
      table:    'nclex_tutor_trend_datasets',
      baseUrl:  '/tutor/bank/trends-v2',
      idPrefix: TUTOR_TREND_ID_PREFIX,
    };
  }
  return {
    table:    'nclex_trend_datasets',
    baseUrl:  '/admin/bank/trends-v2',
    idPrefix: TREND_ID_PREFIX,
  };
}

function readSurface(formData: FormData): Surface {
  const raw = String(formData.get('surface') ?? '');
  return raw === 'tutor' ? 'tutor' : 'admin';
}

// Next 5-digit trend_id for the given surface. Lexical sort works
// because the suffix is fixed-width zero-padded. Vendored from the
// legacy nextTrendId in lib/bank/trend/actions.ts (slice 14 collapses
// the duplication).
async function nextTrendId(
  supabase: ServerSupabaseClient,
  surface:  Surface,
): Promise<string> {
  const cfg = configFor(surface);
  const { data, error } = await supabase
    .from(cfg.table)
    .select('trend_id')
    .like('trend_id', `${cfg.idPrefix}%`)
    .order('trend_id', { ascending: false })
    .limit(1);

  if (error) throw error;

  let next = 1;
  if (data && data.length > 0) {
    const last = (data[0] as { trend_id: string }).trend_id;
    const suffix = last.slice(cfg.idPrefix.length);
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n)) next = n + 1;
  }

  return `${cfg.idPrefix}${String(next).padStart(5, '0')}`;
}

// Insert a new trend dataset row seeded from the chosen kind preset
// (or empty for 'custom'). Redirects to the v2 wrapper page so the
// curator lands directly in the editor for renaming + filling out.
//
// Form fields:
//   - surface           : 'admin' | 'tutor'
//   - kind              : preset key (vitals|labs|io|neuro|assessment) or 'custom'
//   - custom_kind_name  : freeform string, used only when kind === 'custom'
export async function createTrendAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase, user } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const kindRaw = String(formData.get('kind') ?? '').trim();
  const customName = String(formData.get('custom_kind_name') ?? '').trim();

  // Resolve the persisted kind value. Presets pass through verbatim.
  // 'custom' uses the typed name (or falls back to 'custom' if empty,
  // since the picker form should disable Create until non-empty).
  let kind: string;
  if (kindRaw === 'custom') {
    kind = customName || 'custom';
  } else {
    kind = kindRaw || 'custom';
  }

  const trend_id = await nextTrendId(supabase, surface);
  const seed = kindSeedData(kindRaw);

  const row: Record<string, unknown> = {
    trend_id,
    title: 'Untitled trend dataset',
    kind,
    timepoints: seed.timepoints,
    rows:       seed.rows,
  };
  if (surface === 'tutor') {
    row.tutor_id = user.id;
  }
  // is_free_sample, is_builder_visible, is_published all rely on
  // schema defaults (FALSE, TRUE, FALSE) — no need to spell them out.

  const { error } = await supabase.from(cfg.table).insert(row);
  if (error) return { ok: false, error: `Create failed: ${error.message}` };

  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}/${trend_id}`);
}
