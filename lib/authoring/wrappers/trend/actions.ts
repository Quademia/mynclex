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
import type { Surface, TrendFlag, TrendRow } from './types';

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

// ─────────────────────────────────────────────────────────────
// Slice 13c — saveTrendMetadataAction
//
// Direct CRUD update on the dataset row (decision 4 — no RPC for
// save). Reads:
//   - trend_id, surface
//   - title, scenario, kind
//   - is_published, is_free_sample, is_builder_visible
//   - timepoints (JSON), rows (JSON)
//
// Validates rows × timepoints alignment. Returns SaveResult.
// Does NOT touch attached question rows — those are saved
// independently via saveQuestionAction in 13d.
// ─────────────────────────────────────────────────────────────

const VALID_FLAGS = new Set<string>(['abnormal', 'borderline']);

// Normalise + validate rows posted from the data-table editor.
// Mirrors lib/bank/trend/actions.ts parseRows. Rejects mis-aligned
// values/flags arrays — the editor always emits aligned arrays, so
// drift is a real bug worth surfacing rather than silently fixing.
function parseRows(raw: unknown, timepointCount: number): {
  ok: true; rows: TrendRow[];
} | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'rows must be an array' };
  }

  const rows: TrendRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as unknown;
    if (typeof r !== 'object' || r === null) {
      return { ok: false, error: `Row ${i}: expected object` };
    }
    const rec = r as Record<string, unknown>;
    const metric = typeof rec.metric === 'string' ? rec.metric : '';

    if (!Array.isArray(rec.values)) {
      return { ok: false, error: `Row ${i}: values must be an array` };
    }
    if (!Array.isArray(rec.flags)) {
      return { ok: false, error: `Row ${i}: flags must be an array` };
    }
    if (rec.values.length !== timepointCount) {
      return {
        ok:    false,
        error: `Row ${i}: values length ${rec.values.length} doesn't match ${timepointCount} timepoints`,
      };
    }
    if (rec.flags.length !== timepointCount) {
      return {
        ok:    false,
        error: `Row ${i}: flags length ${rec.flags.length} doesn't match ${timepointCount} timepoints`,
      };
    }

    const values = (rec.values as unknown[]).map((v) =>
      typeof v === 'string' ? v : '',
    );

    const flags: TrendFlag[] = (rec.flags as unknown[]).map((f) => {
      if (f === null) return null;
      if (typeof f === 'string' && VALID_FLAGS.has(f)) {
        return f as TrendFlag;
      }
      return null;
    });

    const row: TrendRow = { metric, values, flags };
    const refRangeRaw = typeof rec.ref_range === 'string'
      ? rec.ref_range.trim()
      : '';
    if (refRangeRaw) row.ref_range = refRangeRaw;

    rows.push(row);
  }

  return { ok: true, rows };
}

export async function saveTrendMetadataAction(
  formData: FormData,
): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const scenarioRaw = String(formData.get('scenario') ?? '').trim();
  const scenario = scenarioRaw || null;

  const kind = String(formData.get('kind') ?? '').trim() || 'custom';

  const is_published       = formData.get('is_published') === 'on';
  const is_free_sample     = formData.get('is_free_sample') === 'on';
  const is_builder_visible = formData.get('is_builder_visible') === 'on';

  // Parse timepoints (JSON array of strings).
  const timepointsRaw = String(formData.get('timepoints') ?? '[]') || '[]';
  let timepoints: string[];
  try {
    const parsed: unknown = JSON.parse(timepointsRaw);
    if (!Array.isArray(parsed)) throw new Error('not array');
    timepoints = parsed.map((v) => (typeof v === 'string' ? v : String(v)));
  } catch {
    return { ok: false, error: 'Invalid timepoints JSON.' };
  }

  // Parse + validate rows against timepoints length.
  const rowsRaw = String(formData.get('rows') ?? '[]') || '[]';
  let rowsParsed: unknown;
  try {
    rowsParsed = JSON.parse(rowsRaw);
  } catch {
    return { ok: false, error: 'Invalid rows JSON.' };
  }
  const parsed = parseRows(rowsParsed, timepoints.length);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { error } = await supabase
    .from(cfg.table)
    .update({
      title,
      scenario,
      kind,
      timepoints,
      rows: parsed.rows,
      is_published,
      is_free_sample,
      is_builder_visible,
      updated_at: new Date().toISOString(),
    })
    .eq('trend_id', trend_id);

  if (error) return { ok: false, error: `Save failed: ${error.message}` };

  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  return { ok: true };
}
