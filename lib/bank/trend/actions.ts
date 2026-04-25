// mynclex/lib/bank/trend/actions.ts
//
// Server Actions for the Trend dataset authoring UI — shared by the
// admin (/admin/trends → nclex_trend_datasets) and tutor
// (/tutor/trends → nclex_tutor_trend_datasets) surfaces.
//
// Each action reads a `surface` hidden field from FormData:
//   - 'admin' → requires BANK_CURATE permission (SUPER_ADMIN bypass);
//     writes NCLEX_TRD_NNNNN.
//   - 'tutor' → requires TUTOR role; writes NCLEX_TUT_TRD_NNNNN with
//     tutor_id = auth.uid(). RLS on the tutor table enforces
//     ownership at the DB layer regardless of what this code does.
//
// Action surface (1.12a):
//   - createTrendAction — mints an ID, seeds from kindSeedData, inserts
//     the dataset row, redirects to the editor.
//   - updateTrendAction — updates title / scenario / kind /
//     timepoints / rows / is_published on an existing row. trend_id
//     immutable. Sets updated_at explicitly (see divergence note
//     in mynclex_trend_datasets_slice_1_12a.sql — no trigger pattern
//     in this repo).
//   - deleteTrendAction — deletes. No linked questions exist in 1.12a
//     (trend_id FK doesn't land until 1.12b) so bare delete is
//     safe. 1.12c will replace this with the detach / delete-everything
//     flow once attached questions exist.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  TREND_ID_PREFIX,
  TUTOR_TREND_ID_PREFIX,
} from '@/lib/bank/classifications';
import type { BankFormInitial } from '@/lib/bank/form-shape';
import {
  initialToParsedItem,
  type ParsedSlotInitial,
} from '@/app/(app)/admin/bank/initial-to-parsed';
import { kindSeedData } from './kind-templates';
import type { Surface, TrendFlag, TrendRow } from './types';

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Surface plumbing: table, ID prefix, redirect base URL.
// ─────────────────────────────────────────────────────────────

function surfaceConfig(surface: Surface) {
  if (surface === 'tutor') {
    return {
      table:    'nclex_tutor_trend_datasets' as const,
      baseUrl:  '/tutor/bank/trends',
      idPrefix: TUTOR_TREND_ID_PREFIX,
    };
  }
  return {
    table:    'nclex_trend_datasets' as const,
    baseUrl:  '/admin/trends',
    idPrefix: TREND_ID_PREFIX,
  };
}

function readSurface(formData: FormData): Surface {
  const raw = String(formData.get('surface') ?? '');
  return raw === 'tutor' ? 'tutor' : 'admin';
}

// ─────────────────────────────────────────────────────────────
// Auth + permission gate. Mirrors requireCaseCurator in
// lib/bank/case-study/actions.ts so the two wrapper surfaces
// share identical failure modes.
// ─────────────────────────────────────────────────────────────

async function requireTrendCurator(surface: Surface) {
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
// ID minting. Lexical sort works because the suffix is fixed-width
// zero-padded (NNNNN). Mirrors nextCaseId.
// ─────────────────────────────────────────────────────────────

async function nextTrendId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surface: Surface,
): Promise<string> {
  const cfg = surfaceConfig(surface);
  const { data, error } = await supabase
    .from(cfg.table)
    .select('trend_id')
    .like('trend_id', `${cfg.idPrefix}%`)
    .order('trend_id', { ascending: false })
    .limit(1);

  if (error) throw error;

  let next = 1;
  if (data && data.length > 0) {
    const last = data[0].trend_id as string;
    const suffix = last.slice(cfg.idPrefix.length);
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n)) next = n + 1;
  }

  return `${cfg.idPrefix}${String(next).padStart(5, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────

const VALID_FLAGS = new Set<string>(['abnormal', 'borderline']);

// Normalise + validate the rows payload posted from the data-table
// editor. Shape mirrors the TrendRow interface:
//   { metric, values[], flags[], ref_range? }
// Rows with mis-aligned values/flags arrays are rejected — the
// client builds them aligned with timepoints, so drift here is a bug
// worth surfacing to the curator rather than silently papering over.
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
    if (!metric.trim()) {
      return { ok: false, error: `Row ${i}: metric is required` };
    }

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

// ─────────────────────────────────────────────────────────────
// Create / update / delete
// ─────────────────────────────────────────────────────────────

export async function createTrendAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase, user } = await requireTrendCurator(surface);
  const cfg = surfaceConfig(surface);

  const title = String(formData.get('title') ?? '').trim() || 'Untitled trend dataset';
  const kind  = String(formData.get('kind') ?? 'custom').trim() || 'custom';

  const trend_id = await nextTrendId(supabase, surface);
  const seed = kindSeedData(kind);

  const row: Record<string, unknown> = {
    trend_id,
    title,
    kind,
    timepoints: seed.timepoints,
    rows:       seed.rows,
  };
  if (surface === 'tutor') {
    row.tutor_id = user.id;
  }

  const { error } = await supabase.from(cfg.table).insert(row);

  if (error) {
    return { ok: false, error: `Insert failed: ${error.message}` };
  }

  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}/${trend_id}`);
}

// Slice 1.12b: full-payload save via the new transactional RPC.
// Reads the dataset header + attached child drafts + pending
// deletions from FormData, validates each child via
// initialToParsedItem, then calls nclex_save_trend_with_children
// (admin) or nclex_tutor_save_trend_with_children (tutor) for an
// atomic write.
//
// Pre-RPC validation rationale (mirrors Case Study):
//   • FormData parsing + shape validation happens in TS so we can
//     return user-friendly errors per-question without unwinding
//     the RPC transaction.
//   • parseByType (via initialToParsedItem) does per-type content
//     checks that PL/pgSQL is poorly suited for. The RPC then just
//     persists valid rows atomically.
export async function updateTrendAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireTrendCurator(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const scenarioRaw = String(formData.get('scenario') ?? '').trim();
  const scenario = scenarioRaw || null;

  const kind = String(formData.get('kind') ?? '').trim() || 'custom';

  // Timepoints: JSON array of strings. Empty array allowed (curator
  // may save an empty scaffold).
  const timepointsRaw = String(formData.get('timepoints') ?? '[]') || '[]';
  let timepoints: string[];
  try {
    const parsed: unknown = JSON.parse(timepointsRaw);
    if (!Array.isArray(parsed)) throw new Error('not array');
    timepoints = parsed.map((v) => (typeof v === 'string' ? v : String(v)));
  } catch {
    return { ok: false, error: 'Invalid timepoints JSON.' };
  }

  // Rows: parsed + validated against timepoints length.
  const rowsRaw = String(formData.get('rows') ?? '[]') || '[]';
  let rowsParsed: unknown;
  try {
    rowsParsed = JSON.parse(rowsRaw);
  } catch {
    return { ok: false, error: 'Invalid rows JSON.' };
  }
  const parsedRows = parseRows(rowsParsed, timepoints.length);
  if (!parsedRows.ok) {
    return { ok: false, error: parsedRows.error };
  }

  const is_published = formData.get('is_published') === 'on';

  // Child drafts: array of BankFormInitial objects the editor
  // serialised. Each gets run through initialToParsedItem to
  // produce the RPC-ready shape. A missing field surfaces as an
  // error before we touch the RPC, so nothing is half-written.
  //
  // Empty-slot filter (handoff decision 6): a draft with no stem
  // AND no question_type beyond the MCQ default is dropped here
  // as defence-in-depth. The editor already filters, but a stale
  // payload or a curator who clicked Add and then saved without
  // typing shouldn't end up with a garbage row. BankFormInitial's
  // question_type is non-nullable, so we filter on stem only —
  // mirrors isSlotPopulated in the case-study save path.
  const questionsJsonRaw = String(formData.get('questions_json') ?? '[]');
  let questionsRaw: unknown;
  try {
    questionsRaw = JSON.parse(questionsJsonRaw);
  } catch {
    return { ok: false, error: 'Invalid questions_json.' };
  }
  if (!Array.isArray(questionsRaw)) {
    return { ok: false, error: 'questions_json must be an array.' };
  }

  const parsedQuestions: ParsedSlotInitial[] = [];
  for (let i = 0; i < questionsRaw.length; i++) {
    const raw = questionsRaw[i] as BankFormInitial | undefined;
    if (!raw) continue;
    // Empty-slot filter: no stem → drop. Curator clicked Add but
    // never typed. Consistent with the RPC's own skip-filter.
    if (typeof raw.stem !== 'string' || raw.stem.trim() === '') {
      continue;
    }
    const parsed = initialToParsedItem(raw);
    if (!parsed.ok) {
      return {
        ok:    false,
        error: `Question ${i + 1}: ${parsed.error}`,
      };
    }
    parsedQuestions.push(parsed.item);
  }

  // Deleted item IDs: JSON array of strings. Empty by default.
  const deletedRaw = String(formData.get('deleted_item_ids') ?? '[]');
  let deletedIds: string[];
  try {
    const parsed: unknown = JSON.parse(deletedRaw);
    if (!Array.isArray(parsed)) throw new Error('not array');
    deletedIds = parsed
      .map((v) => (typeof v === 'string' ? v : String(v)))
      .filter(Boolean);
  } catch {
    return { ok: false, error: 'Invalid deleted_item_ids JSON.' };
  }

  // Build the RPC payload. Shape documented in
  // mynclex_trend_save_rpc_slice_1_12b.sql's header block.
  const payload = {
    trend: {
      trend_id,
      title,
      scenario,
      kind,
      timepoints,
      rows: parsedRows.rows,
      is_published,
    },
    questions: parsedQuestions,
    deleted_item_ids: deletedIds,
  };

  const rpcName =
    surface === 'tutor'
      ? 'nclex_tutor_save_trend_with_children'
      : 'nclex_save_trend_with_children';

  const { data, error } = await supabase.rpc(rpcName, { payload });

  if (error) {
    return { ok: false, error: `Save failed: ${error.message}` };
  }
  if (!data || typeof data !== 'object' || !('ok' in data)) {
    return { ok: false, error: 'RPC returned an unexpected shape.' };
  }

  const cfg = surfaceConfig(surface);
  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  redirect(`${cfg.baseUrl}/${trend_id}?saved=1`);
}

// Bare delete, tightened in Slice 1.12c.
// Refuses when the dataset has ≥1 attached questions — the curator
// must use the dialog flow (detachAndDeleteTrendAction or
// deleteTrendAndChildrenAction). Defence-in-depth: the editor's UI
// already gates this, but a direct-API caller bypasses the editor.
// The DB's ON DELETE RESTRICT on trend_id is the final fence.
export async function deleteTrendAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireTrendCurator(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const cfg = surfaceConfig(surface);

  // Check for attached children first. The tutor surface filters by
  // tutor_id so cross-tutor snooping can't see other tutors' items;
  // RLS enforces the same at the DB layer. Admin surface sees all
  // attached items under BANK_CURATE.
  const childTable =
    surface === 'tutor' ? 'nclex_tutor_questions' : 'nclex_bank_items';
  let childQuery = supabase
    .from(childTable)
    .select('item_id', { count: 'exact', head: true })
    .eq('trend_id', trend_id);
  if (surface === 'tutor') {
    // Belt-and-braces — RLS already enforces this.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) childQuery = childQuery.eq('tutor_id', user.id);
  }
  const { count, error: countErr } = await childQuery;
  if (countErr) {
    return { ok: false, error: `Check failed: ${countErr.message}` };
  }
  if ((count ?? 0) > 0) {
    return {
      ok:    false,
      error:
        `Cannot delete: dataset has ${count} attached ` +
        `${count === 1 ? 'question' : 'questions'}. Use the delete dialog ` +
        `to detach or delete them together.`,
    };
  }

  const { error } = await supabase
    .from(cfg.table)
    .delete()
    .eq('trend_id', trend_id);

  if (error) {
    return { ok: false, error: `Delete failed: ${error.message}` };
  }

  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}?deleted=1`);
}

// Slice 1.12c — detach all attached questions (set trend_id = NULL),
// then delete the dataset. One transactional RPC. Attached questions
// survive as standalone items editable at /admin/bank.
export async function detachAndDeleteTrendAction(
  formData: FormData,
): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireTrendCurator(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const rpcName =
    surface === 'tutor'
      ? 'nclex_tutor_detach_and_delete_trend'
      : 'nclex_detach_and_delete_trend';

  const { data, error } = await supabase.rpc(rpcName, { p_trend_id: trend_id });

  if (error) {
    return { ok: false, error: `Detach-and-delete failed: ${error.message}` };
  }
  if (!data || typeof data !== 'object' || !('ok' in data)) {
    return { ok: false, error: 'RPC returned an unexpected shape.' };
  }

  const cfg = surfaceConfig(surface);
  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}?deleted=1`);
}

// Slice 1.12c — delete every attached question AND the dataset in
// one transaction. Destructive.
export async function deleteTrendAndChildrenAction(
  formData: FormData,
): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireTrendCurator(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const rpcName =
    surface === 'tutor'
      ? 'nclex_tutor_delete_trend_and_children'
      : 'nclex_delete_trend_and_children';

  const { data, error } = await supabase.rpc(rpcName, { p_trend_id: trend_id });

  if (error) {
    return { ok: false, error: `Delete-everything failed: ${error.message}` };
  }
  if (!data || typeof data !== 'object' || !('ok' in data)) {
    return { ok: false, error: 'RPC returned an unexpected shape.' };
  }

  const cfg = surfaceConfig(surface);
  revalidatePath(cfg.baseUrl);
  redirect(`${cfg.baseUrl}?deleted=1`);
}
