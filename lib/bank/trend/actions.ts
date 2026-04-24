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
      baseUrl:  '/tutor/trends',
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

  const cfg = surfaceConfig(surface);

  // updated_at set explicitly — see the migration's divergence note.
  // No trigger function exists in this repo; every write path sets
  // updated_at itself, mirroring upsertTabAction in
  // lib/bank/case-study/actions.ts.
  const { error } = await supabase
    .from(cfg.table)
    .update({
      title,
      scenario,
      kind,
      timepoints,
      rows:       parsedRows.rows,
      is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('trend_id', trend_id);

  if (error) {
    return { ok: false, error: `Update failed: ${error.message}` };
  }

  revalidatePath(`${cfg.baseUrl}/${trend_id}`);
  redirect(`${cfg.baseUrl}/${trend_id}?saved=1`);
}

export async function deleteTrendAction(formData: FormData): Promise<ActionResult> {
  const surface = readSurface(formData);
  const { supabase } = await requireTrendCurator(surface);

  const trend_id = String(formData.get('trend_id') ?? '').trim();
  if (!trend_id) return { ok: false, error: 'Missing trend_id.' };

  const cfg = surfaceConfig(surface);

  // No attached questions exist in 1.12a — trend_id FK lands in
  // 1.12b. Bare delete is safe here. 1.12c will replace this with
  // the detach / delete-everything confirmation flow.
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
