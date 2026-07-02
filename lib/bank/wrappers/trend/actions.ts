// mynclex/lib/bank/wrappers/trend/actions.ts
//
// Server actions for the trend wrapper.
//
//   - createTrendAction        (kind-picker create flow)
//   - saveTrendMetadataAction  (direct CRUD update on the dataset row)
//   - detachQuestionAction     (clears trend_id on a question row)
//   - deleteTrendAction        (three modes: simple / detach-and-delete /
//                               delete-everything)
//
// All save + delete are direct CRUD — no transactional RPC. The legacy
// nclex_save_trend_with_children + nclex_detach_and_delete_trend +
// nclex_delete_trend_and_children RPCs are unused; cleanup pass deferred.
//
// Surface-aware: branches between admin (nclex_trend_datasets) and
// tutor (nclex_tutor_trend_datasets) via the surface form field.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireBankCurator, type ServerSupabaseClient } from '@/lib/access';
import {
  TREND_ID_PREFIX,
  TUTOR_TREND_ID_PREFIX,
} from '../../classifications';
import {
  isBuiltIn,
  isCustomTabKey,
  customShapeForKey,
  type CustomShape,
} from './tab-types';
import type { Surface } from './types';

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

interface SurfaceConfig {
  table:    'nclex_trend_datasets' | 'nclex_tutor_trend_datasets';
  baseUrl:  '/admin/bank/trends' | '/tutor/bank/trends';
  idPrefix: string;
}

function configFor(surface: Surface): SurfaceConfig {
  if (surface === 'tutor') {
    return {
      table:    'nclex_tutor_trend_datasets',
      baseUrl:  '/tutor/bank/trends',
      idPrefix: TUTOR_TREND_ID_PREFIX,
    };
  }
  return {
    table:    'nclex_trend_datasets',
    baseUrl:  '/admin/bank/trends',
    idPrefix: TREND_ID_PREFIX,
  };
}

function readSurface(formData: FormData): Surface {
  const raw = String(formData.get('surface') ?? '');
  return raw === 'tutor' ? 'tutor' : 'admin';
}

// Next 5-digit trend_id for the given surface. Lexical sort works
// because the canonical suffix is fixed-width zero-padded.
//
// Defensive: pull more than one row and walk past any trend_ids whose
// suffix isn't purely numeric (e.g. seed/test IDs like
// NCLEX_TRD_TEST_06). Lex DESC puts those above genuine numeric IDs
// because 'T' (0x54) > '0' (0x30); without the walk, parseInt("TEST_06")
// is NaN and `next` falls back to 1, generating a colliding NCLEX_TRD_00001.
async function nextTrendId(
  supabase: ServerSupabaseClient,
  surface:  Surface,
): Promise<string> {
  const cfg = configFor(surface);

  // Tutor surface: RLS scopes a tutor to their OWN rows
  // (nclex_tutor_trend_datasets_tutor_own = tutor_id = auth.uid()), so a
  // client-side max+1 only counts the caller's datasets and collides with
  // other tutors' ids on the pkey. Defer to a SECURITY DEFINER RPC that scans
  // the whole table. (Admin/bank curators see all datasets, so the direct scan
  // below is correct there.) See migration 20260708120000_tutor_wrapper_id_rpcs.
  if (surface === 'tutor') {
    const { data, error } = await supabase.rpc('nclex_next_tutor_trend_id', {
      p_prefix: cfg.idPrefix,
    });
    if (error) throw error;
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('nclex_next_tutor_trend_id returned no id');
    }
    return data;
  }

  const { data, error } = await supabase
    .from(cfg.table)
    .select('trend_id')
    .like('trend_id', `${cfg.idPrefix}%`)
    .order('trend_id', { ascending: false })
    .limit(100);

  if (error) throw error;

  let next = 1;
  for (const row of (data ?? []) as Array<{ trend_id: string }>) {
    const suffix = row.trend_id.slice(cfg.idPrefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n)) {
      next = n + 1;
      break;
    }
  }

  return `${cfg.idPrefix}${String(next).padStart(5, '0')}`;
}

// Insert a new draft trend dataset and redirect to the wrapper editor,
// where the curator sets the title + kind label and builds the chart
// tabs. No kind picker — a new trend starts as 'custom' (the flat-grid
// seeds the presets used to drive are gone). Form fields: surface only.
export async function createTrendAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase, user } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const trend_id = await nextTrendId(supabase, surface);

  // No kind picker any more — a new trend is created as a draft and the
  // curator sets the title + kind label in the editor. `kind` is just a
  // display label now (the flat-grid seeds it used to drive are gone).
  const row: Record<string, unknown> = {
    trend_id,
    title: 'Untitled trend dataset',
    kind: 'custom',
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
//
// The stimulus (chart tabs) saves independently via the tab actions;
// attached questions save via saveQuestionAction. This action only
// touches the dataset's own metadata + visibility.
// ─────────────────────────────────────────────────────────────

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

  // Scenario is rich content — the client posts a serialized Tiptap doc.
  // Store it verbatim (do not trim/normalise the JSON); '' → null.
  const scenario = String(formData.get('scenario') ?? '') || null;

  const kind = String(formData.get('kind') ?? '').trim() || 'custom';

  const is_published       = formData.get('is_published') === 'on';
  const is_free_sample     = formData.get('is_free_sample') === 'on';
  const is_builder_visible = formData.get('is_builder_visible') === 'on';

  const { error } = await supabase
    .from(cfg.table)
    .update({
      title,
      scenario,
      kind,
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

// ─────────────────────────────────────────────────────────────
// Slice 13e — Detach question
//
// Clears trend_id on the bank-item row. Question survives in the
// bank as a standalone item. Simpler than CS's detach (no join
// table to drop) — the link is one column.
// ─────────────────────────────────────────────────────────────

interface DetachConfig {
  questionTable: 'nclex_bank_items' | 'nclex_tutor_questions';
}

function detachConfigFor(surface: Surface): DetachConfig {
  if (surface === 'tutor') {
    return { questionTable: 'nclex_tutor_questions' };
  }
  return { questionTable: 'nclex_bank_items' };
}

export async function detachQuestionAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);
  const dcfg = detachConfigFor(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  const item_id  = String(formData.get('item_id') ?? '').trim();
  if (!trend_id || !item_id) {
    return { ok: false, error: 'Missing trend_id or item_id.' };
  }

  // Clear trend_id on the question row. We also check that the FK
  // currently points at the wrapper's trend_id — defends against a
  // stale form submission for a question that's already been detached
  // or moved.
  const { error } = await supabase
    .from(dcfg.questionTable)
    .update({ trend_id: null })
    .eq('item_id', item_id)
    .eq('trend_id', trend_id);

  if (error) return { ok: false, error: `Detach failed: ${error.message}` };

  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Slice 13e — Delete trend dataset (three modes)
//
// 'simple'             : zero-attached, drop the dataset row.
// 'detach-and-delete'  : clear trend_id on each attached question,
//                        then drop the dataset. Questions survive.
// 'delete-everything'  : drop attached questions + the dataset.
//
// Typed-confirm gating lives in the client dialog; the action
// trusts the mode value.
//
// Direct CRUD (decision 4); the legacy RPCs (nclex_detach_and_delete_trend
// and nclex_delete_trend_and_children) stay unused by this code.
// ─────────────────────────────────────────────────────────────

export type DeleteTrendMode = 'simple' | 'detach-and-delete' | 'delete-everything';

export async function deleteTrendAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);
  const dcfg = detachConfigFor(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const modeRaw = String(formData.get('mode') ?? 'simple');
  const mode: DeleteTrendMode =
    modeRaw === 'detach-and-delete' || modeRaw === 'delete-everything'
      ? modeRaw
      : 'simple';

  if (mode === 'detach-and-delete') {
    // Clear trend_id on every linked question. Bare delete on the
    // dataset row would otherwise hit the ON DELETE RESTRICT FK.
    const { error: qErr } = await supabase
      .from(dcfg.questionTable)
      .update({ trend_id: null })
      .eq('trend_id', trend_id);
    if (qErr) return { ok: false, error: `Detach failed: ${qErr.message}` };
  } else if (mode === 'delete-everything') {
    // Drop attached questions first (FK constraint blocks dataset
    // delete otherwise).
    const { error: qDelErr } = await supabase
      .from(dcfg.questionTable)
      .delete()
      .eq('trend_id', trend_id);
    if (qDelErr) return { ok: false, error: `Could not delete questions: ${qDelErr.message}` };
  }

  const { error: dsDelErr } = await supabase
    .from(cfg.table)
    .delete()
    .eq('trend_id', trend_id);
  if (dsDelErr) return { ok: false, error: `Delete dataset failed: ${dsDelErr.message}` };

  revalidatePath(cfg.baseUrl);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Chart-tab actions (upsert / delete / reorder) — trend rich
// multi-chart Slice 2. Mirror of the case-study tab actions, keyed to
// trend_id + nclex_trend_tabs. Trend owns its copy (wrappers stay
// independent); the injected save/delete from the shared editors call
// these with the trend_id already set.
// ─────────────────────────────────────────────────────────────

type TabTable = 'nclex_trend_tabs' | 'nclex_tutor_trend_tabs';

function tabTableFor(surface: Surface): TabTable {
  return surface === 'tutor' ? 'nclex_tutor_trend_tabs' : 'nclex_trend_tabs';
}

// Next tab_id for a dataset. Shape: {trend_id}_TAB_{N}. Computes max in
// TS because N is not zero-padded (lexical sort unreliable).
async function nextTabId(
  supabase: ServerSupabaseClient,
  surface:  Surface,
  trend_id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from(tabTableFor(surface))
    .select('tab_id')
    .eq('trend_id', trend_id);

  if (error) throw error;

  const prefix = `${trend_id}_TAB_`;
  let next = 1;
  if (data && data.length > 0) {
    for (const row of data) {
      const tab_id = row.tab_id as string;
      const n = parseInt(tab_id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n >= next) next = n + 1;
    }
  }
  return `${prefix}${next}`;
}

export async function upsertTabAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const tab_id_raw = String(formData.get('tab_id') ?? '').trim();
  const isUpdate = tab_id_raw.length > 0;

  const tab_key = String(formData.get('tab_key') ?? '').trim();
  if (!tab_key) return { ok: false, error: 'Missing tab_key.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Tab title is required.' };

  const display_orderRaw = parseInt(String(formData.get('display_order') ?? '0'), 10);
  const display_order =
    Number.isFinite(display_orderRaw) && display_orderRaw >= 0 ? display_orderRaw : 0;

  const is_custom = formData.get('is_custom') === 'true';

  // Validate tab_key/is_custom/custom_shape consistency.
  let custom_shape: CustomShape | null = null;
  if (is_custom) {
    if (!isCustomTabKey(tab_key)) {
      return {
        ok: false,
        error: 'Custom tab must use tab_key custom_narrative or custom_grid.',
      };
    }
    custom_shape = customShapeForKey(tab_key);
  } else {
    if (!isBuiltIn(tab_key)) {
      return { ok: false, error: `Unknown built-in tab_key: ${tab_key}.` };
    }
  }

  const columnsRaw = String(formData.get('columns_def') ?? '[]') || '[]';
  let columns_def: unknown;
  try {
    columns_def = JSON.parse(columnsRaw);
    if (!Array.isArray(columns_def)) throw new Error('not array');
  } catch {
    return { ok: false, error: 'Invalid columns_def JSON.' };
  }

  // entries is always a v2 rich blob (merge table or narrative object)
  // for trend — a fresh build with no v1 ChartEntry legacy.
  const entriesRaw = String(formData.get('entries') ?? '[]') || '[]';
  let entries: unknown;
  try {
    entries = JSON.parse(entriesRaw);
    const ok = Array.isArray(entries) || (entries !== null && typeof entries === 'object');
    if (!ok) throw new Error('bad shape');
  } catch {
    return { ok: false, error: 'Invalid entries JSON.' };
  }

  const tabTable = tabTableFor(surface);

  if (isUpdate) {
    const { error } = await supabase
      .from(tabTable)
      .update({
        tab_key,
        title,
        display_order,
        is_custom,
        custom_shape,
        columns_def,
        entries,
        updated_at: new Date().toISOString(),
      })
      .eq('tab_id', tab_id_raw)
      .eq('trend_id', trend_id);

    if (error) return { ok: false, error: `Tab update failed: ${error.message}` };
  } else {
    const tab_id = await nextTabId(supabase, surface, trend_id);
    const { error } = await supabase.from(tabTable).insert({
      tab_id,
      trend_id,
      tab_key,
      title,
      display_order,
      is_custom,
      custom_shape,
      columns_def,
      entries,
    });

    if (error) return { ok: false, error: `Tab insert failed: ${error.message}` };
  }

  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  return { ok: true };
}

export async function deleteTabAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  const tab_id   = String(formData.get('tab_id') ?? '').trim();
  if (!trend_id || !tab_id) {
    return { ok: false, error: 'Missing trend_id or tab_id.' };
  }

  const { error } = await supabase
    .from(tabTableFor(surface))
    .delete()
    .eq('tab_id', tab_id)
    .eq('trend_id', trend_id);

  if (error) return { ok: false, error: `Tab delete failed: ${error.message}` };

  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  return { ok: true };
}

// Two-pass shift to dodge UNIQUE (trend_id, display_order) mid-reorder:
// phase 1 negates each row's target order; phase 2 sets each to final.
export async function reorderTabsAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const ordersRaw = String(formData.get('tab_orders') ?? '[]');
  let orders: { tab_id: string; display_order: number }[];
  try {
    const parsed: unknown = JSON.parse(ordersRaw);
    if (!Array.isArray(parsed)) throw new Error('not array');
    orders = parsed as { tab_id: string; display_order: number }[];
  } catch {
    return { ok: false, error: 'Invalid tab_orders JSON.' };
  }

  for (const o of orders) {
    if (typeof o?.tab_id !== 'string' || !o.tab_id) {
      return { ok: false, error: 'Invalid tab_id in orders.' };
    }
    if (typeof o.display_order !== 'number' || o.display_order < 0) {
      return { ok: false, error: 'Invalid display_order in orders.' };
    }
  }

  const tabTable = tabTableFor(surface);

  // Phase 1: shift affected rows into the negative range.
  for (const o of orders) {
    const { error } = await supabase
      .from(tabTable)
      .update({ display_order: -1 - o.display_order })
      .eq('tab_id', o.tab_id)
      .eq('trend_id', trend_id);
    if (error) return { ok: false, error: `Reorder failed: ${error.message}` };
  }

  // Phase 2: set each to its target order.
  const now = new Date().toISOString();
  for (const o of orders) {
    const { error } = await supabase
      .from(tabTable)
      .update({ display_order: o.display_order, updated_at: now })
      .eq('tab_id', o.tab_id)
      .eq('trend_id', trend_id);
    if (error) return { ok: false, error: `Reorder failed: ${error.message}` };
  }

  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  return { ok: true };
}
