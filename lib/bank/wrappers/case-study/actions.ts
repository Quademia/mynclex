// mynclex/lib/bank/wrappers/case-study/actions.ts
//
// Server actions for the case-study wrapper page.
// Surface-aware: branches between admin (nclex_case_studies +
// nclex_case_study_items) and tutor (nclex_tutor_case_studies +
// nclex_tutor_case_study_items).
//
// saveCaseMetadataAction — wrapper-metadata save. Updates:
//   - Case row: title, scenario_summary, is_free_sample,
//     is_builder_visible, is_published.
//   - Existing slot join rows: cjmm_step (per position).
//
// upsertTabAction / deleteTabAction / reorderTabsAction — chart-tab
// CRUD. reorderTabsAction uses a two-pass shift to dodge the
// UNIQUE (case_id, display_order) constraint mid-reorder.
//
// Does NOT touch the underlying nclex_bank_items / nclex_tutor_questions
// content of attached questions — that's saveQuestionAction's job.
// Per-question publish gating happens at the question-save layer.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireBankCurator, type ServerSupabaseClient } from '@/lib/access';
import {
  CJMM_STEPS,
  CASE_ID_PREFIX,
  TUTOR_CASE_ID_PREFIX,
  type CjmmStep,
} from '../../classifications';
import type { Surface } from './types';
import {
  isBuiltIn,
  isCustomTabKey,
  customShapeForKey,
  type CustomShape,
} from './chart-tabs/tab-types';

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

interface SurfaceConfig {
  caseTable:  'nclex_case_studies' | 'nclex_tutor_case_studies';
  itemsTable: 'nclex_case_study_items' | 'nclex_tutor_case_study_items';
  tabTable:   'nclex_case_study_tabs' | 'nclex_tutor_case_study_tabs';
  baseUrl:    '/admin/bank/cases' | '/tutor/bank/cases';
}

function configFor(surface: Surface): SurfaceConfig {
  if (surface === 'tutor') {
    return {
      caseTable:  'nclex_tutor_case_studies',
      itemsTable: 'nclex_tutor_case_study_items',
      tabTable:   'nclex_tutor_case_study_tabs',
      baseUrl:    '/tutor/bank/cases',
    };
  }
  return {
    caseTable:  'nclex_case_studies',
    itemsTable: 'nclex_case_study_items',
    tabTable:   'nclex_case_study_tabs',
    baseUrl:    '/admin/bank/cases',
  };
}

const VALID_CJMM = new Set<string>(CJMM_STEPS);

function readSurface(formData: FormData): Surface {
  const raw = String(formData.get('surface') ?? '');
  return raw === 'tutor' ? 'tutor' : 'admin';
}

// Next 5-digit case_id for the given surface.
//
// Can't trust a single lexical-max row: manually-named / seed case_ids
// (e.g. NCLEX_CS_TEST...) sort ABOVE the zero-padded numbers ('T' >
// '0'), so the old lexical-max + parseInt gave NaN, fell back to 1, and
// collided on NCLEX_CS_00001. Scan every id for this prefix and take the
// true max over only the pure-digit suffixes — the auto-numbering
// scheme's own ids. (Mirrors nextItemId in lib/bank/actions/save-question.ts
// and the defensive nextTrendId.)
async function nextCaseId(
  supabase: ServerSupabaseClient,
  surface: Surface,
): Promise<string> {
  const cfg = configFor(surface);
  const idPrefix = surface === 'tutor' ? TUTOR_CASE_ID_PREFIX : CASE_ID_PREFIX;

  // Tutor surface: RLS scopes a tutor to their OWN rows
  // (nclex_tutor_case_studies_tutor_own = tutor_id = auth.uid()), so a
  // client-side max+1 only counts the caller's cases and collides with other
  // tutors' ids on the pkey. Defer to a SECURITY DEFINER RPC that scans the
  // whole table. (Admin/bank curators see all cases, so the direct scan below
  // is correct there.) See migration 20260708120000_tutor_wrapper_id_rpcs.
  if (surface === 'tutor') {
    const { data, error } = await supabase.rpc('nclex_next_tutor_case_id', {
      p_prefix: idPrefix,
    });
    if (error) throw error;
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('nclex_next_tutor_case_id returned no id');
    }
    return data;
  }

  const { data, error } = await supabase
    .from(cfg.caseTable)
    .select('case_id')
    .like('case_id', `${idPrefix}%`);

  if (error) throw error;

  let max = 0;
  for (const r of (data ?? []) as Array<{ case_id: string }>) {
    const suffix = r.case_id.slice(idPrefix.length);
    if (/^\d+$/.test(suffix)) {
      const n = parseInt(suffix, 10);
      if (n > max) max = n;
    }
  }

  return `${idPrefix}${String(max + 1).padStart(5, '0')}`;
}

// Insert a new case row with title 'Untitled case' and redirect to
// the wrapper page so the curator lands directly in Wrapper mode
// to rename. Tutor surface stamps tutor_id; admin doesn't.
export async function createCaseAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase, user } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const case_id = await nextCaseId(supabase, surface);

  const row: Record<string, unknown> = {
    case_id,
    title: 'Untitled case',
  };
  if (surface === 'tutor') {
    row.tutor_id = user.id;
  }

  const { error } = await supabase.from(cfg.caseTable).insert(row);
  if (error) return { ok: false, error: `Create failed: ${error.message}` };

  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}/${case_id}`);
}

export async function saveCaseMetadataAction(
  formData: FormData,
): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

  // ── Case-row patch ──────────────────────────────────────────
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const scenario_summary =
    String(formData.get('scenario_summary') ?? '').trim() || null;

  const is_free_sample     = formData.get('is_free_sample') === 'on';
  const is_builder_visible = formData.get('is_builder_visible') === 'on';
  const is_published       = formData.get('is_published') === 'on';

  const { error: caseErr } = await supabase
    .from(cfg.caseTable)
    .update({
      title,
      scenario_summary,
      is_free_sample,
      is_builder_visible,
      is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('case_id', case_id);

  if (caseErr) return { ok: false, error: `Save failed: ${caseErr.message}` };

  // ── Slot cjmm_step updates ──────────────────────────────────
  // Form carries cjmm_<position> fields for each populated slot
  // (positions whose item_id is non-null). Empty-string value clears
  // back to NULL; otherwise must be a valid CJMM step.
  for (let pos = 1; pos <= 6; pos++) {
    const raw = formData.get(`cjmm_${pos}`);
    if (raw === null) continue;          // not in the form (empty slot)
    const value = String(raw).trim();

    let nextCjmm: CjmmStep | null = null;
    if (value !== '') {
      if (!VALID_CJMM.has(value)) {
        return {
          ok: false,
          error: `Invalid CJMM step at Q${pos}: ${value}`,
        };
      }
      nextCjmm = value as CjmmStep;
    }

    const { error: slotErr } = await supabase
      .from(cfg.itemsTable)
      .update({ cjmm_step: nextCjmm })
      .eq('case_id', case_id)
      .eq('position', pos);

    if (slotErr) {
      return {
        ok: false,
        error: `Save failed at Q${pos} cjmm: ${slotErr.message}`,
      };
    }
  }

  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  return { ok: true };
}

// "Publish all & publish case" — publishes every attached question, then
// publishes the case. Offered from the wrapper's Publish toggle when all
// 6 questions are present but one or more is still a draft. Safe because a
// saved question row is always well-formed (so flipping the draft flag
// can't surface a broken question), and case children can't leak as
// standalone practice items (the student builder excludes
// parent_case_id IS NOT NULL) — publishing them only makes them reachable
// through this case. The curator opts into this explicitly; the wrapper
// never publishes questions on its own. Save (saveCaseMetadataAction)
// stays ungated.
export async function publishCaseWithChildrenAction(
  formData: FormData,
): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

  // Resolve the attached question ids (positions 1-6).
  const { data: joins, error: joinErr } = await supabase
    .from(cfg.itemsTable)
    .select('item_id, position')
    .eq('case_id', case_id);
  if (joinErr) return { ok: false, error: `Could not load questions: ${joinErr.message}` };

  const inRange = (joins ?? []).filter(
    (j) =>
      typeof j.position === 'number' &&
      j.position >= 1 &&
      j.position <= 6 &&
      typeof j.item_id === 'string' &&
      j.item_id.length > 0,
  );
  const filled = new Set(inRange.map((j) => j.position as number)).size;
  if (filled < 6) {
    return {
      ok: false,
      error: `Publishing requires all 6 questions — only ${filled} attached.`,
    };
  }
  const itemIds = inRange.map((j) => j.item_id as string);

  // Publish the attached questions (idempotent — already-live ones stay live).
  const qTable =
    surface === 'tutor' ? 'nclex_tutor_questions' : 'nclex_bank_items';
  const { error: pubErr } = await supabase
    .from(qTable)
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .in('item_id', itemIds);
  if (pubErr) {
    return { ok: false, error: `Could not publish the questions: ${pubErr.message}` };
  }

  // Persist the case (is_published on, from the form) through the normal
  // metadata writer.
  return saveCaseMetadataAction(formData);
}

// ─────────────────────────────────────────────────────────────
// Chart-tab actions (upsert / delete / reorder)
// ─────────────────────────────────────────────────────────────

// Next tab_id for a case. Shape: {case_id}_TAB_{N}. Computes max in TS
// because N is not zero-padded (lexical sort unreliable).
async function nextTabId(
  supabase: ServerSupabaseClient,
  surface:  Surface,
  case_id:  string,
): Promise<string> {
  const cfg = configFor(surface);
  const { data, error } = await supabase
    .from(cfg.tabTable)
    .select('tab_id')
    .eq('case_id', case_id);

  if (error) throw error;

  const prefix = `${case_id}_TAB_`;
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

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

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

  // Parse JSONB fields. Empty strings tolerated — default to [].
  const columnsRaw = String(formData.get('columns_def') ?? '[]') || '[]';
  let columns_def: unknown;
  try {
    columns_def = JSON.parse(columnsRaw);
    if (!Array.isArray(columns_def)) throw new Error('not array');
  } catch {
    return { ok: false, error: 'Invalid columns_def JSON.' };
  }

  const entriesRaw = String(formData.get('entries') ?? '[]') || '[]';
  let entries: unknown;
  try {
    entries = JSON.parse(entriesRaw);
    // v1 tabs store a ChartEntry[] array; the v2 custom merge table
    // (rich-content relook) stores a single `{ v:2, … }` object. Accept
    // either — both are valid JSONB; the editor knows which it is.
    const ok = Array.isArray(entries) || (entries !== null && typeof entries === 'object');
    if (!ok) throw new Error('bad shape');
  } catch {
    return { ok: false, error: 'Invalid entries JSON.' };
  }

  const cfg = configFor(surface);

  if (isUpdate) {
    const { error } = await supabase
      .from(cfg.tabTable)
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
      .eq('case_id', case_id);

    if (error) return { ok: false, error: `Tab update failed: ${error.message}` };
  } else {
    const tab_id = await nextTabId(supabase, surface, case_id);
    const { error } = await supabase.from(cfg.tabTable).insert({
      tab_id,
      case_id,
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

  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  return { ok: true };
}

export async function deleteTabAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  const tab_id  = String(formData.get('tab_id') ?? '').trim();
  if (!case_id || !tab_id) {
    return { ok: false, error: 'Missing case_id or tab_id.' };
  }

  const cfg = configFor(surface);

  const { error } = await supabase
    .from(cfg.tabTable)
    .delete()
    .eq('tab_id', tab_id)
    .eq('case_id', case_id);

  if (error) return { ok: false, error: `Tab delete failed: ${error.message}` };

  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  return { ok: true };
}

// Two-pass shift to dodge UNIQUE (case_id, display_order) mid-reorder:
// phase 1 negates each row's target order; phase 2 sets each to final.
export async function reorderTabsAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

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

  const cfg = configFor(surface);

  // Phase 1: shift affected rows into the negative range.
  for (const o of orders) {
    const { error } = await supabase
      .from(cfg.tabTable)
      .update({ display_order: -1 - o.display_order })
      .eq('tab_id', o.tab_id)
      .eq('case_id', case_id);
    if (error) return { ok: false, error: `Reorder failed: ${error.message}` };
  }

  // Phase 2: set each to its target order.
  const now = new Date().toISOString();
  for (const o of orders) {
    const { error } = await supabase
      .from(cfg.tabTable)
      .update({ display_order: o.display_order, updated_at: now })
      .eq('tab_id', o.tab_id)
      .eq('case_id', case_id);
    if (error) return { ok: false, error: `Reorder failed: ${error.message}` };
  }

  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Slot detach (12e) — removes the join row + clears parent_case_id
// on the question. Question survives in the bank as standalone.
// ─────────────────────────────────────────────────────────────

interface DetachConfig {
  itemsTable:    'nclex_case_study_items' | 'nclex_tutor_case_study_items';
  questionTable: 'nclex_bank_items' | 'nclex_tutor_questions';
}

function detachConfigFor(surface: Surface): DetachConfig {
  if (surface === 'tutor') {
    return {
      itemsTable:    'nclex_tutor_case_study_items',
      questionTable: 'nclex_tutor_questions',
    };
  }
  return {
    itemsTable:    'nclex_case_study_items',
    questionTable: 'nclex_bank_items',
  };
}

export async function detachQuestionAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);
  const dcfg = detachConfigFor(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  const item_id = String(formData.get('item_id') ?? '').trim();
  if (!case_id || !item_id) {
    return { ok: false, error: 'Missing case_id or item_id.' };
  }

  // Drop the join row first (RESTRICT on item_id means we can't
  // delete the question while it's joined; detach unblocks any
  // future direct-delete from the bank).
  const { error: joinErr } = await supabase
    .from(dcfg.itemsTable)
    .delete()
    .eq('case_id', case_id)
    .eq('item_id', item_id);
  if (joinErr) return { ok: false, error: `Detach failed: ${joinErr.message}` };

  // Clear parent_case_id on the question so the bank list shows it
  // as standalone again.
  const { error: qErr } = await supabase
    .from(dcfg.questionTable)
    .update({ parent_case_id: null })
    .eq('item_id', item_id);
  if (qErr) return { ok: false, error: `Detach succeeded but question update failed: ${qErr.message}` };

  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Case delete (12e) — two-path. Action dispatches on `mode` from
// the form:
//   - 'simple'             : zero-attached, just drop the case row.
//   - 'detach-and-delete'  : clear parent_case_id on each attached
//                            question, then drop the case (CASCADE
//                            handles join rows). Questions survive.
//   - 'delete-everything'  : drop join rows + delete questions, then
//                            drop the case. Nothing survives.
// Typed-DELETE / typed-DETACH gating lives in the client atom; the
// action trusts the mode value.
// ─────────────────────────────────────────────────────────────

export type DeleteCaseMode = 'simple' | 'detach-and-delete' | 'delete-everything';

export async function deleteCaseAction(formData: FormData): Promise<SaveResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireBankCurator(surface);
  const cfg = configFor(surface);
  const dcfg = detachConfigFor(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

  const modeRaw = String(formData.get('mode') ?? 'simple');
  const mode: DeleteCaseMode =
    modeRaw === 'detach-and-delete' || modeRaw === 'delete-everything'
      ? modeRaw
      : 'simple';

  let attachedItemIds: string[] = [];
  if (mode !== 'simple') {
    const { data: joinRows, error: joinFetchErr } = await supabase
      .from(dcfg.itemsTable)
      .select('item_id')
      .eq('case_id', case_id);
    if (joinFetchErr) return { ok: false, error: `Could not load attached questions: ${joinFetchErr.message}` };
    attachedItemIds = (joinRows ?? []).map((r) => r.item_id as string);
  }

  if (mode === 'detach-and-delete') {
    if (attachedItemIds.length > 0) {
      const { error: qErr } = await supabase
        .from(dcfg.questionTable)
        .update({ parent_case_id: null })
        .in('item_id', attachedItemIds);
      if (qErr) return { ok: false, error: `Detach failed: ${qErr.message}` };
    }
    // CASCADE drops the join rows when the case row goes.
  } else if (mode === 'delete-everything') {
    // Drop join rows first (RESTRICT on item_id blocks question
    // deletion otherwise).
    const { error: joinDelErr } = await supabase
      .from(dcfg.itemsTable)
      .delete()
      .eq('case_id', case_id);
    if (joinDelErr) return { ok: false, error: `Could not unlink questions: ${joinDelErr.message}` };

    if (attachedItemIds.length > 0) {
      const { error: qDelErr } = await supabase
        .from(dcfg.questionTable)
        .delete()
        .in('item_id', attachedItemIds);
      if (qDelErr) return { ok: false, error: `Could not delete questions: ${qDelErr.message}` };
    }
  }

  const { error: caseDelErr } = await supabase
    .from(cfg.caseTable)
    .delete()
    .eq('case_id', case_id);
  if (caseDelErr) return { ok: false, error: `Delete case failed: ${caseDelErr.message}` };

  revalidatePath(cfg.baseUrl);
  return { ok: true };
}
