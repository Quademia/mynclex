// mynclex/lib/bank/case-study/actions.ts
//
// Server Actions for the Case Study authoring UI — shared by the admin
// (/admin/bank/cases → nclex_case_studies + nclex_case_study_tabs) and
// tutor (/tutor/bank/cases → nclex_tutor_case_studies +
// nclex_tutor_case_study_tabs) surfaces.
//
// Each action reads a `surface` hidden field from FormData:
//   - 'admin' → requires BANK_CURATE permission (SUPER_ADMIN bypasses);
//     writes NCLEX_CS_NNNNN.
//   - 'tutor' → requires TUTOR role; writes NCLEX_TUT_CS_NNNNN with
//     tutor_id = auth.uid(). RLS on the tutor tables enforces ownership
//     at the DB layer regardless of what this code does.
//
// Action surface:
//   - createCaseAction / updateCaseAction / deleteCaseAction — operate
//     on the case header row. Create + delete redirect; update stays
//     on the editor with ?saved=1.
//   - upsertTabAction / deleteTabAction — fine-grained tab writes.
//     Return { ok: true } after revalidating the editor path so the
//     caller can stay put without a redirect (handoff calls for
//     per-tab saves independent of case-header dirty state).
//   - reorderTabsAction — batch display_order update using a two-pass
//     shift (negate, then set) to dodge the UNIQUE (case_id,
//     display_order) constraint mid-reorder.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  CLIENT_NEEDS_CATEGORIES,
  DIFFICULTY_LEVELS,
  CASE_ID_PREFIX,
  TUTOR_CASE_ID_PREFIX,
  CJMM_STEPS,
  type CjmmStep,
} from '@/lib/bank/classifications';
import type { BankFormInitial } from '@/lib/bank/form-shape';
import { initialToParsedItem } from '@/app/(app)/admin/bank/initial-to-parsed';
import {
  isBuiltIn,
  isCustomTabKey,
  customShapeForKey,
  type CustomShape,
} from './tab-types';
import type { Surface } from './types';

const VALID_CATEGORIES = new Set<string>(CLIENT_NEEDS_CATEGORIES);
const VALID_DIFFICULTIES = new Set<string>(DIFFICULTY_LEVELS);

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Surface plumbing: tables, ID prefix, redirect base URL.
// ─────────────────────────────────────────────────────────────

function surfaceConfig(surface: Surface) {
  if (surface === 'tutor') {
    return {
      caseTable: 'nclex_tutor_case_studies' as const,
      tabTable:  'nclex_tutor_case_study_tabs' as const,
      baseUrl:   '/tutor/bank/cases',
      idPrefix:  TUTOR_CASE_ID_PREFIX,
    };
  }
  return {
    caseTable: 'nclex_case_studies' as const,
    tabTable:  'nclex_case_study_tabs' as const,
    baseUrl:   '/admin/bank/cases',
    idPrefix:  CASE_ID_PREFIX,
  };
}

function readSurface(formData: FormData): Surface {
  const raw = String(formData.get('surface') ?? '');
  return raw === 'tutor' ? 'tutor' : 'admin';
}

// ─────────────────────────────────────────────────────────────
// Auth + permission gate. Mirrors requireSurfaceAuth in
// app/(app)/admin/bank/actions.ts so the two surfaces have the
// same failure modes (anon → /login; wrong admin → /admin; wrong
// tutor → /no-access).
// ─────────────────────────────────────────────────────────────

async function requireCaseCurator(surface: Surface) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (surface === 'tutor') {
    const { data: rolesData } = await supabase
      .from('nclex_user_roles')
      .select('role')
      .eq('user_id', user.id);

    const roles = (rolesData ?? []).map((r) => r.role as string);

    if (!roles.includes('TUTOR')) {
      redirect('/no-access');
    }

    return { supabase, user };
  }

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);

  const canCurate =
    roles.includes('SUPER_ADMIN') || perms.includes('BANK_CURATE');

  if (!canCurate) {
    redirect('/admin');
  }

  return { supabase, user };
}

// ─────────────────────────────────────────────────────────────
// ID minting
// ─────────────────────────────────────────────────────────────

// Next 5-digit case_id for the given surface.
// Lexical sort works because the suffix is fixed-width zero-padded.
async function nextCaseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surface: Surface,
): Promise<string> {
  const cfg = surfaceConfig(surface);
  const { data, error } = await supabase
    .from(cfg.caseTable)
    .select('case_id')
    .like('case_id', `${cfg.idPrefix}%`)
    .order('case_id', { ascending: false })
    .limit(1);

  if (error) throw error;

  let next = 1;
  if (data && data.length > 0) {
    const last = data[0].case_id as string;
    const suffix = last.slice(cfg.idPrefix.length);
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n)) next = n + 1;
  }

  return `${cfg.idPrefix}${String(next).padStart(5, '0')}`;
}

// Next tab_id for a case. Shape: {case_id}_TAB_{N}. N is not
// zero-padded, so lexical sort is unreliable — compute max in TS.
// Skips reuse of N for deleted tabs so tab_ids stay monotonic.
async function nextTabId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surface: Surface,
  case_id: string,
): Promise<string> {
  const cfg = surfaceConfig(surface);
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

// ─────────────────────────────────────────────────────────────
// Case-header actions: create / update / delete
// ─────────────────────────────────────────────────────────────

export async function createCaseAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase, user } = await requireCaseCurator(surface);
  const cfg = surfaceConfig(surface);
  const case_id = await nextCaseId(supabase, surface);

  const row: Record<string, unknown> = {
    case_id,
    title: 'Untitled case',
  };
  if (surface === 'tutor') {
    row.tutor_id = user.id;
  }

  const { error } = await supabase.from(cfg.caseTable).insert(row);

  if (error) {
    return { ok: false, error: `Insert failed: ${error.message}` };
  }

  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}/${case_id}`);
}

// Shape of each entry in the client-sent slots_json array. The editor
// serialises its slotDrafts (one BankFormInitial per slot, or null
// for empty) + slotCjmm into this structure before submit.
interface SlotPayloadFromClient {
  position:  number;                  // 1-6
  cjmm_step: string | null;
  initial:   BankFormInitial | null;  // null = empty slot
}

export async function updateCaseAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireCaseCurator(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

  // ── Build case_patch JSONB from the left-hand form fields ────
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const client_needs_category_raw = String(formData.get('client_needs_category') ?? '').trim();
  if (client_needs_category_raw && !VALID_CATEGORIES.has(client_needs_category_raw)) {
    return { ok: false, error: 'Invalid client needs category.' };
  }

  const difficultyRaw = String(formData.get('difficulty') ?? '').trim();
  const difficulty = difficultyRaw && VALID_DIFFICULTIES.has(difficultyRaw) ? difficultyRaw : null;

  const tagsRaw = String(formData.get('tags') ?? '');
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

  const casePatch = {
    title,
    scenario_summary:         String(formData.get('scenario_summary') ?? '').trim() || null,
    client_needs_category:    client_needs_category_raw || null,
    client_needs_subcategory: String(formData.get('client_needs_subcategory') ?? '').trim() || null,
    nursing_subject:          String(formData.get('nursing_subject') ?? '').trim() || null,
    body_system:              String(formData.get('body_system') ?? '').trim() || null,
    topic:                    String(formData.get('topic') ?? '').trim() || null,
    subtopic:                 String(formData.get('subtopic') ?? '').trim() || null,
    difficulty,
    tags,
    is_free_sample:     formData.get('is_free_sample') === 'on',
    is_builder_visible: formData.get('is_builder_visible') !== 'off',
    is_published:       formData.get('is_published') === 'on',
  };

  // ── Parse the slots payload the editor stashed as slots_json ─
  // Empty cases (no Q slots ever opened) still submit a 6-element
  // array with every `initial` null — keeps the RPC's iteration
  // uniform. Missing field → treat as empty case.
  const slotsJsonRaw = String(formData.get('slots_json') ?? '[]');
  let slotsPayload: SlotPayloadFromClient[];
  try {
    const parsed = JSON.parse(slotsJsonRaw);
    if (!Array.isArray(parsed)) throw new Error('slots_json is not an array');
    slotsPayload = parsed as SlotPayloadFromClient[];
  } catch (e) {
    return {
      ok: false,
      error: `Invalid slots_json: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Validate cjmm_step values. Null is allowed (editor shows
  // placeholder); any non-null must be one of the CJMM steps.
  const validCjmm = new Set<string>(CJMM_STEPS);
  for (const s of slotsPayload) {
    if (s.cjmm_step !== null && !validCjmm.has(s.cjmm_step)) {
      return { ok: false, error: `Invalid CJMM step at position ${s.position}: ${s.cjmm_step}` };
    }
    if (typeof s.position !== 'number' || s.position < 1 || s.position > 6) {
      return { ok: false, error: `Invalid slot position: ${s.position}` };
    }
  }

  // Validate each populated slot via initialToParsedItem — same
  // rules as standalone bank create/update.
  const slotsForRpc = slotsPayload.map((s) => {
    if (s.initial === null) {
      return {
        position:  s.position,
        cjmm_step: s.cjmm_step,
        initial:   null,
      };
    }
    const parsed = initialToParsedItem(s.initial);
    if (!parsed.ok) {
      return { __error: `Q${s.position}: ${parsed.error}` };
    }
    return {
      position:  s.position,
      cjmm_step: s.cjmm_step as CjmmStep | null,
      initial:   parsed.item,
    };
  });

  const firstError = slotsForRpc.find(
    (s): s is { __error: string } => '__error' in s,
  );
  if (firstError) {
    return { ok: false, error: firstError.__error };
  }

  // Guard: if the case is being published, all 6 slots must be
  // populated. The RPC re-validates this server-side — the early
  // check here just produces a friendlier error for the curator.
  if (casePatch.is_published) {
    const missing = slotsForRpc.filter(
      (s) => !('__error' in s) && (s as { initial: unknown }).initial === null,
    );
    if (missing.length > 0) {
      return {
        ok: false,
        error:
          `Cannot publish: ${missing.length} of 6 slots still empty. ` +
          `Fill all six questions before ticking Published.`,
      };
    }
  }

  // ── Call the transactional RPC ──────────────────────────────
  const { data, error } = await supabase.rpc('nclex_save_case_with_children', {
    p_surface:    surface,
    p_case_id:    case_id,
    p_case_patch: casePatch,
    p_slots:      slotsForRpc,
  });

  if (error) {
    return { ok: false, error: `Save failed: ${error.message}` };
  }
  // The RPC returns { ok: true, case_id, slots_saved } on success.
  // Any failure path inside the function RAISEs, which surfaces via
  // `error` above and triggers a transaction rollback.
  if (!data || typeof data !== 'object' || !('ok' in data)) {
    return { ok: false, error: 'RPC returned an unexpected shape.' };
  }

  const cfg = surfaceConfig(surface);
  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  redirect(`${cfg.baseUrl}/${case_id}?saved=1`);
}

export async function deleteCaseAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireCaseCurator(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  if (!case_id) return { ok: false, error: 'Missing case_id.' };

  const cfg = surfaceConfig(surface);

  // CASCADE on the tabs FK handles child-row cleanup.
  const { error } = await supabase
    .from(cfg.caseTable)
    .delete()
    .eq('case_id', case_id);

  if (error) {
    return { ok: false, error: `Delete failed: ${error.message}` };
  }

  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}?deleted=1`);
}

// ─────────────────────────────────────────────────────────────
// Tab actions: upsert / delete / reorder
// ─────────────────────────────────────────────────────────────

export async function upsertTabAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireCaseCurator(surface);

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
    if (!Array.isArray(entries)) throw new Error('not array');
  } catch {
    return { ok: false, error: 'Invalid entries JSON.' };
  }

  const cfg = surfaceConfig(surface);

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

export async function deleteTabAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireCaseCurator(surface);

  const case_id = String(formData.get('case_id') ?? '').trim();
  const tab_id  = String(formData.get('tab_id') ?? '').trim();
  if (!case_id || !tab_id) {
    return { ok: false, error: 'Missing case_id or tab_id.' };
  }

  const cfg = surfaceConfig(surface);

  const { error } = await supabase
    .from(cfg.tabTable)
    .delete()
    .eq('tab_id', tab_id)
    .eq('case_id', case_id);

  if (error) return { ok: false, error: `Tab delete failed: ${error.message}` };

  revalidatePath(`${cfg.baseUrl}/${case_id}`);
  return { ok: true };
}

// Batch reorder. Client sends JSON array [{tab_id, display_order}, ...].
// Two-pass strategy to dodge the UNIQUE (case_id, display_order)
// constraint: first push all affected rows into the negative range,
// then set each to its final order. Inefficient but robust; fine for
// the handful of tabs a case will ever have.
export async function reorderTabsAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireCaseCurator(surface);

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

  const cfg = surfaceConfig(surface);

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
