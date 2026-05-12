// mynclex/lib/curriculum/actions.ts
//
// Server actions for the Unit Builder (slice 9.3b). Five actions:
//   • createActivityAction — INSERT loose Text activity at end of
//     unit body.
//   • editActivityAction  — UPDATE shared fields + payload.
//   • deleteActivityAction — DELETE (simple confirm, no
//     type-to-confirm: low-stakes, text content is recoverable
//     mentally and v1 has no consuming students yet).
//   • reorderActivityAction — swap two loose activities by
//     ordinal direction.
//   • editUnitAction — UPDATE unit title / description /
//     is_published.
//
// RLS on nclex_programme_units / _activities enforces parent-
// programme ownership; these actions don't re-check ownership in
// app code beyond the auth.getUser() guard. The .select('...').single()
// pattern surfaces "row not found OR not yours" as a generic error
// so a malicious client can't probe for IDs.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  ActivityFormValues,
  ActivityType,
  BlockFormValues,
  UnitFormValues,
} from './types';

// ---------- shared helpers ----------

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function trimOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

// Slice 9.3d-a — URL gate.
// Accepts http: + https: only. `javascript:`, `data:`, `file:`,
// and any other scheme rejects so we can safely render the URL
// as an anchor on the student side without an XSS vector.
function validateHttpUrl(
  value: string,
  fieldLabel: string
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: `${fieldLabel} is not a valid URL.` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: `${fieldLabel} must start with http:// or https://`,
    };
  }
  return { ok: true, url: trimmed };
}

// Slice 9.3d-a — datetime gate.
// The client sends UTC ISO (converted from the datetime-local
// input via new Date(localStr).toISOString()). We re-parse to
// catch malformed values and re-emit canonical ISO.
function validateScheduledAt(
  value: string
): { ok: true; iso: string } | { ok: false; error: string } {
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { ok: false, error: 'Session date/time is not valid.' };
  }
  return { ok: true, iso: d.toISOString() };
}

// Slice 9.3d-a — payload builder.
// Per-type validation + assembly of the JSONB payload column. The
// discriminated `ActivityFormValues` argument narrows on `type`;
// every branch returns the strict payload shape for that type.
//
// PDF / Mock / Practice quiz land in 9.3d-b — the union doesn't
// include them yet, so the switch is currently exhaustive over
// the three editor-enabled types.
function buildPayload(
  values: import('./types').ActivityFormValues
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  switch (values.type) {
    case 'TEXT': {
      return {
        ok: true,
        payload: {
          body: values.body,
          ...(values.estimated_minutes != null
            ? { estimated_minutes: values.estimated_minutes }
            : {}),
        },
      };
    }
    case 'EXTERNAL_LINK': {
      const u = validateHttpUrl(values.url, 'URL');
      if (!u.ok) return u;
      return {
        ok: true,
        payload: {
          url: u.url,
          ...(values.estimated_minutes != null
            ? { estimated_minutes: values.estimated_minutes }
            : {}),
        },
      };
    }
    case 'ONLINE_LIVE_SESSION': {
      const when = validateScheduledAt(values.scheduled_at);
      if (!when.ok) return when;

      if (
        !Number.isInteger(values.duration_minutes) ||
        values.duration_minutes <= 0
      ) {
        return {
          ok: false,
          error: 'Duration must be a positive whole number of minutes.',
        };
      }

      const join = validateHttpUrl(values.join_url, 'Join URL');
      if (!join.ok) return join;

      let recordingClean: string | null = null;
      if (values.recording_url != null && values.recording_url.trim() !== '') {
        const rec = validateHttpUrl(values.recording_url, 'Recording URL');
        if (!rec.ok) return rec;
        recordingClean = rec.url;
      }

      return {
        ok: true,
        payload: {
          scheduled_at: when.iso,
          duration_minutes: values.duration_minutes,
          join_url: join.url,
          ...(recordingClean ? { recording_url: recordingClean } : {}),
        },
      };
    }
  }
}

function refreshProgrammeCurriculumPaths(programmeId: string, unitId: string) {
  // Units overview meta-line counts change; unit detail body
  // contents change. Both surfaces need a refresh.
  revalidatePath(`/tutor/programme/${programmeId}/curriculum`);
  revalidatePath(`/tutor/programme/${programmeId}/curriculum/unit/${unitId}`);
}

// Shared SupabaseClient type for the cross-table helpers below.
// `createClient()` returns the same shape on every call; this
// alias keeps the helper signatures clean.
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Compute the next ordinal at the unit-body layer — the position
// after every existing block + loose activity in the unit. The
// unit body's ordinal space is shared across both tables; this
// reads both and takes max+1.
async function nextUnitBodyOrdinal(
  supabase: SupabaseClient,
  unitId: string
): Promise<number> {
  const [b, a] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select('ordinal')
      .eq('unit_id', unitId)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('nclex_programme_activities')
      .select('ordinal')
      .eq('unit_id', unitId)
      .is('block_id', null)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const blockMax = b.data?.ordinal ?? 0;
  const looseMax = a.data?.ordinal ?? 0;
  return Math.max(blockMax, looseMax) + 1;
}

// Compute the next ordinal inside a single block — scoped to
// activities whose block_id matches. Used when appending an
// activity to a block.
async function nextBlockOrdinal(
  supabase: SupabaseClient,
  blockId: string
): Promise<number> {
  const { data } = await supabase
    .from('nclex_programme_activities')
    .select('ordinal')
    .eq('block_id', blockId)
    .order('ordinal', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.ordinal ?? 0) + 1;
}

// Unit-body neighbour discovery for cross-table reorder. Loads
// every block + loose activity in the unit and sorts them by
// ordinal. Returns the sorted list — callers find their target
// row and pick the neighbour by index.
type UnitBodyOrdinal =
  | { kind: 'block'; id: string; ordinal: number }
  | { kind: 'loose'; id: string; ordinal: number };

async function loadUnitBodyOrdinals(
  supabase: SupabaseClient,
  unitId: string
): Promise<UnitBodyOrdinal[]> {
  const [b, a] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select('block_id, ordinal')
      .eq('unit_id', unitId),
    supabase
      .from('nclex_programme_activities')
      .select('activity_id, ordinal')
      .eq('unit_id', unitId)
      .is('block_id', null),
  ]);
  const entries: UnitBodyOrdinal[] = [
    ...((b.data ?? []) as Array<{ block_id: string; ordinal: number }>).map(
      (r) => ({ kind: 'block' as const, id: r.block_id, ordinal: r.ordinal })
    ),
    ...(
      (a.data ?? []) as Array<{ activity_id: string; ordinal: number }>
    ).map((r) => ({
      kind: 'loose' as const,
      id: r.activity_id,
      ordinal: r.ordinal,
    })),
  ];
  entries.sort((x, y) => x.ordinal - y.ordinal);
  return entries;
}

// Atomic-ish swap of two ordinals across the unit-body tables.
// Two UPDATEs; not transactional at the DB. There's no UNIQUE
// constraint on (unit_id, ordinal) so a brief mid-state with a
// duplicate ordinal sorts back consistently via the tiebreaker in
// composeUnitBody(). Same approach as 9.3b's loose-only swap.
async function swapUnitBodyOrdinals(
  supabase: SupabaseClient,
  a: UnitBodyOrdinal,
  b: UnitBodyOrdinal
): Promise<void> {
  const now = new Date().toISOString();
  await applyOrdinal(supabase, a, b.ordinal, now);
  await applyOrdinal(supabase, b, a.ordinal, now);
}

async function applyOrdinal(
  supabase: SupabaseClient,
  entry: UnitBodyOrdinal,
  newOrdinal: number,
  now: string
): Promise<void> {
  if (entry.kind === 'block') {
    await supabase
      .from('nclex_programme_blocks')
      .update({ ordinal: newOrdinal, updated_at: now })
      .eq('block_id', entry.id);
  } else {
    await supabase
      .from('nclex_programme_activities')
      .update({ ordinal: newOrdinal, updated_at: now })
      .eq('activity_id', entry.id);
  }
}

// =========================================================
// createActivityAction (TEXT in 9.3b; other types in 9.3d)
// =========================================================

export type CreateActivityResult =
  | { ok: true; activity_id: string }
  | { ok: false; error: string };

export async function createActivityAction(
  unitId: string,
  values: ActivityFormValues,
  blockId: string | null = null
): Promise<CreateActivityResult> {
  const title = values.title.trim();
  if (title.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }

  // Per-type validation + payload assembly. The `values` union
  // discriminates on `type`; PDF / MOCK / PRACTICE_QUIZ aren't
  // editor-enabled yet (their picker tiles say "Coming soon")
  // so a stale client can't submit them — TS narrows them out of
  // the union here.
  const built = buildPayload(values);
  if (!built.ok) return built;

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Resolve the unit's programme_id. RLS on the units row scopes
  // to the tutor's own; if the unit doesn't exist for this user
  // we surface "not found" generically.
  const { data: unitRow, error: unitErr } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (unitErr) return { ok: false, error: unitErr.message };
  if (!unitRow) {
    return { ok: false, error: 'Unit not found or not yours.' };
  }

  // If creating into a block, verify the block belongs to this
  // unit (RLS already scopes to this tutor's programmes). Then
  // compute the next ordinal scoped to that block. Otherwise
  // append at the bottom of the unit body across blocks + loose
  // activities together.
  let nextOrdinal: number;
  if (blockId !== null) {
    const { data: blockRow } = await supabase
      .from('nclex_programme_blocks')
      .select('block_id, unit_id')
      .eq('block_id', blockId)
      .maybeSingle();
    if (!blockRow || blockRow.unit_id !== unitId) {
      return { ok: false, error: 'Block not found or not yours.' };
    }
    nextOrdinal = await nextBlockOrdinal(supabase, blockId);
  } else {
    nextOrdinal = await nextUnitBodyOrdinal(supabase, unitId);
  }

  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .insert({
      unit_id: unitId,
      block_id: blockId,
      ordinal: nextOrdinal,
      type: values.type,
      title,
      description: trimOrNull(values.description),
      note: trimOrNull(values.note),
      payload: built.payload,
      is_published: false,
    })
    .select('activity_id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create activity.' };
  }

  refreshProgrammeCurriculumPaths(unitRow.programme_id, unitId);
  return { ok: true, activity_id: data.activity_id };
}

// =========================================================
// editActivityAction (TEXT in 9.3b)
// =========================================================

export type EditActivityResult = { ok: true } | { ok: false; error: string };

export async function editActivityAction(
  activityId: string,
  values: ActivityFormValues
): Promise<EditActivityResult> {
  const title = values.title.trim();
  if (title.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }

  const built = buildPayload(values);
  if (!built.ok) return built;

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Activity type is fixed at create time — editing can't change
  // it. .eq('type', values.type) belt + suspenders pins the
  // UPDATE so a stale client can't switch types mid-edit.
  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .update({
      title,
      description: trimOrNull(values.description),
      note: trimOrNull(values.note),
      payload: built.payload,
      updated_at: new Date().toISOString(),
    })
    .eq('activity_id', activityId)
    .eq('type', values.type)
    .select('activity_id, unit_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Activity not found or not yours to edit.' };
  }

  // Look up programme_id for revalidation (cheap; one row).
  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', data.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, data.unit_id);
  }
  return { ok: true };
}

// =========================================================
// deleteActivityAction
// =========================================================

export type DeleteActivityResult = { ok: true } | { ok: false; error: string };

export async function deleteActivityAction(
  activityId: string
): Promise<DeleteActivityResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .delete()
    .eq('activity_id', activityId)
    .select('activity_id, unit_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Activity not found or not yours to delete.' };
  }

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', data.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, data.unit_id);
  }
  return { ok: true };
}

// =========================================================
// reorderActivityAction — arrow-driven swap
// =========================================================
// Branches on whether the activity is loose or in-block:
//
//   • In-block (block_id NOT NULL): swap with the sibling
//     activity inside the same block. Single-table swap.
//
//   • Loose (block_id IS NULL): swap with the unit-body
//     neighbour, which may be ANOTHER loose activity OR a block.
//     The unit body interleaves both kinds in one ordinal
//     sequence (composeUnitBody merges them), so the neighbour
//     could live in either table.
//
// Two UPDATEs in either branch; not transactional. No UNIQUE
// constraint on ordinals to worry about. The merge in
// composeUnitBody carries a tiebreaker so a brief mid-state
// reads back coherently.

export type ReorderActivityResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reorderActivityAction(
  activityId: string,
  direction: 'up' | 'down'
): Promise<ReorderActivityResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: self, error: selfErr } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, unit_id, ordinal, block_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (selfErr) return { ok: false, error: selfErr.message };
  if (!self) return { ok: false, error: 'Activity not found or not yours.' };

  if (self.block_id !== null) {
    // ----- In-block swap (single-table) -----
    const neighbourQuery = supabase
      .from('nclex_programme_activities')
      .select('activity_id, ordinal')
      .eq('block_id', self.block_id);

    const { data: neighbour } = direction === 'up'
      ? await neighbourQuery
          .lt('ordinal', self.ordinal)
          .order('ordinal', { ascending: false })
          .limit(1)
          .maybeSingle()
      : await neighbourQuery
          .gt('ordinal', self.ordinal)
          .order('ordinal', { ascending: true })
          .limit(1)
          .maybeSingle();

    if (!neighbour) return { ok: true }; // edge — no-op

    const now = new Date().toISOString();
    await supabase
      .from('nclex_programme_activities')
      .update({ ordinal: neighbour.ordinal, updated_at: now })
      .eq('activity_id', self.activity_id);
    await supabase
      .from('nclex_programme_activities')
      .update({ ordinal: self.ordinal, updated_at: now })
      .eq('activity_id', neighbour.activity_id);
  } else {
    // ----- Loose: cross-table unit-body swap -----
    const entries = await loadUnitBodyOrdinals(supabase, self.unit_id);
    const selfIndex = entries.findIndex(
      (e) => e.kind === 'loose' && e.id === self.activity_id
    );
    if (selfIndex === -1) {
      // Race: row vanished between reads. Treat as no-op.
      return { ok: true };
    }
    const neighbourIndex = direction === 'up' ? selfIndex - 1 : selfIndex + 1;
    if (neighbourIndex < 0 || neighbourIndex >= entries.length) {
      return { ok: true }; // edge — no-op
    }
    await swapUnitBodyOrdinals(
      supabase,
      entries[selfIndex],
      entries[neighbourIndex]
    );
  }

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', self.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, self.unit_id);
  }
  return { ok: true };
}

// =========================================================
// editUnitAction — title / description / is_published
// =========================================================

export type EditUnitResult = { ok: true } | { ok: false; error: string };

export async function editUnitAction(
  unitId: string,
  values: UnitFormValues
): Promise<EditUnitResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programme_units')
    .update({
      title: trimOrNull(values.title),
      description: trimOrNull(values.description),
      is_published: values.is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('unit_id', unitId)
    .select('unit_id, programme_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Unit not found or not yours to edit.' };
  }

  refreshProgrammeCurriculumPaths(data.programme_id, unitId);
  return { ok: true };
}

// =========================================================
// SLICE 9.3c — Block actions
// =========================================================

// Resolve a block's parent unit + programme in one helper. Used
// for revalidation paths after every block-mutating action. RLS
// already scopes the block to programmes the tutor owns; this
// chase is purely about path lookup, not authz.
async function resolveBlockOwnership(
  supabase: SupabaseClient,
  blockId: string
): Promise<{ unit_id: string; programme_id: string } | null> {
  const { data: blockRow } = await supabase
    .from('nclex_programme_blocks')
    .select('block_id, unit_id')
    .eq('block_id', blockId)
    .maybeSingle();
  if (!blockRow) return null;
  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', blockRow.unit_id)
    .maybeSingle();
  if (!unitRow) return null;
  return { unit_id: blockRow.unit_id, programme_id: unitRow.programme_id };
}

// =========================================================
// createBlockAction — inline rename create
// =========================================================
// Inline create flow: tutor clicks "+ Add block", inline title
// input appears, submit fires this action. Description +
// is_published default empty/false; the tutor edits them via
// the block-form modal later. Append at end of unit body.

export type CreateBlockResult =
  | { ok: true; block_id: string }
  | { ok: false; error: string };

export async function createBlockAction(
  unitId: string,
  values: BlockFormValues
): Promise<CreateBlockResult> {
  const title = values.title.trim();
  if (title.length === 0) {
    return { ok: false, error: 'Block title is required.' };
  }

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (!unitRow) return { ok: false, error: 'Unit not found or not yours.' };

  const nextOrdinal = await nextUnitBodyOrdinal(supabase, unitId);

  const { data, error } = await supabase
    .from('nclex_programme_blocks')
    .insert({
      unit_id: unitId,
      ordinal: nextOrdinal,
      title,
      description: trimOrNull(values.description),
      is_published: values.is_published,
    })
    .select('block_id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create block.' };
  }

  refreshProgrammeCurriculumPaths(unitRow.programme_id, unitId);
  return { ok: true, block_id: data.block_id };
}

// =========================================================
// editBlockAction — title / description / is_published
// =========================================================

export type EditBlockResult = { ok: true } | { ok: false; error: string };

export async function editBlockAction(
  blockId: string,
  values: BlockFormValues
): Promise<EditBlockResult> {
  const title = values.title.trim();
  if (title.length === 0) {
    return { ok: false, error: 'Block title is required.' };
  }

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programme_blocks')
    .update({
      title,
      description: trimOrNull(values.description),
      is_published: values.is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('block_id', blockId)
    .select('block_id, unit_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Block not found or not yours to edit.' };
  }

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', data.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, data.unit_id);
  }
  return { ok: true };
}

// =========================================================
// deleteBlockAction — explicit block delete (cascades activities)
// =========================================================
// Used by the block-header ✕ button. FK ON DELETE CASCADE on
// nclex_programme_activities.block_id drops every activity in
// the block as a side effect of this DELETE — the confirm dialog
// surfaces the count so the tutor knows what's about to vanish.

export type DeleteBlockResult = { ok: true } | { ok: false; error: string };

export async function deleteBlockAction(
  blockId: string
): Promise<DeleteBlockResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const ownership = await resolveBlockOwnership(supabase, blockId);
  if (!ownership) {
    return { ok: false, error: 'Block not found or not yours.' };
  }

  const { error } = await supabase
    .from('nclex_programme_blocks')
    .delete()
    .eq('block_id', blockId);

  if (error) return { ok: false, error: error.message };

  refreshProgrammeCurriculumPaths(
    ownership.programme_id,
    ownership.unit_id
  );
  return { ok: true };
}

// =========================================================
// reorderBlockAction — cross-table unit-body swap
// =========================================================
// Swaps the block with its unit-body neighbour, which may be
// another block OR a loose activity. Mirrors the loose-activity
// branch of reorderActivityAction.

export type ReorderBlockResult = { ok: true } | { ok: false; error: string };

export async function reorderBlockAction(
  blockId: string,
  direction: 'up' | 'down'
): Promise<ReorderBlockResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: self } = await supabase
    .from('nclex_programme_blocks')
    .select('block_id, unit_id, ordinal')
    .eq('block_id', blockId)
    .maybeSingle();
  if (!self) return { ok: false, error: 'Block not found or not yours.' };

  const entries = await loadUnitBodyOrdinals(supabase, self.unit_id);
  const selfIndex = entries.findIndex(
    (e) => e.kind === 'block' && e.id === self.block_id
  );
  if (selfIndex === -1) return { ok: true };
  const neighbourIndex = direction === 'up' ? selfIndex - 1 : selfIndex + 1;
  if (neighbourIndex < 0 || neighbourIndex >= entries.length) {
    return { ok: true };
  }
  await swapUnitBodyOrdinals(
    supabase,
    entries[selfIndex],
    entries[neighbourIndex]
  );

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', self.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, self.unit_id);
  }
  return { ok: true };
}

// =========================================================
// moveActivityIntoBlockAction
// =========================================================
// Promotes a loose activity into a block. Activity must be loose
// (block_id IS NULL) at call time; block must live in the same
// unit. New ordinal = next within the target block. The activity's
// old loose-ordinal slot is simply dropped — gaps in the unit-body
// sequence are fine.

export type MoveActivityIntoBlockResult =
  | { ok: true }
  | { ok: false; error: string };

export async function moveActivityIntoBlockAction(
  activityId: string,
  blockId: string
): Promise<MoveActivityIntoBlockResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, unit_id, block_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity) {
    return { ok: false, error: 'Activity not found or not yours.' };
  }
  if (activity.block_id !== null) {
    return { ok: false, error: 'Activity is already inside a block.' };
  }

  const { data: block } = await supabase
    .from('nclex_programme_blocks')
    .select('block_id, unit_id')
    .eq('block_id', blockId)
    .maybeSingle();
  if (!block) return { ok: false, error: 'Block not found or not yours.' };
  if (block.unit_id !== activity.unit_id) {
    return { ok: false, error: 'Block belongs to a different unit.' };
  }

  const newOrdinal = await nextBlockOrdinal(supabase, blockId);

  const { error } = await supabase
    .from('nclex_programme_activities')
    .update({
      block_id: blockId,
      ordinal: newOrdinal,
      updated_at: new Date().toISOString(),
    })
    .eq('activity_id', activityId);

  if (error) return { ok: false, error: error.message };

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', activity.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, activity.unit_id);
  }
  return { ok: true };
}

// =========================================================
// moveActivityOutOfBlockAction
// =========================================================
// Demotes a block activity to loose. New ordinal = next in unit
// body across both tables. Used by both the "Move out as loose"
// row action and the empty-block "preserve" branch below.

export type MoveActivityOutOfBlockResult =
  | { ok: true }
  | { ok: false; error: string };

export async function moveActivityOutOfBlockAction(
  activityId: string
): Promise<MoveActivityOutOfBlockResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, unit_id, block_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity) {
    return { ok: false, error: 'Activity not found or not yours.' };
  }
  if (activity.block_id === null) {
    return { ok: false, error: 'Activity is already loose.' };
  }

  const newOrdinal = await nextUnitBodyOrdinal(supabase, activity.unit_id);

  const { error } = await supabase
    .from('nclex_programme_activities')
    .update({
      block_id: null,
      ordinal: newOrdinal,
      updated_at: new Date().toISOString(),
    })
    .eq('activity_id', activityId);

  if (error) return { ok: false, error: error.message };

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', activity.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, activity.unit_id);
  }
  return { ok: true };
}

// =========================================================
// deleteLastBlockActivityAction — empty-block prompt branches
// =========================================================
// Triggered when the user clicks ✕ on an activity that's the
// LAST one in its block. The UI shows a richer prompt with two
// options and dispatches here:
//
//   choice = 'cascade'  — delete the activity AND the block.
//                         (DB-level cascade: deleting the block
//                          drops the activity via FK.)
//   choice = 'preserve' — keep the activity, move it out as loose,
//                         then delete the now-empty block.
//
// Either way the block ends up gone. Defensive count check at
// the top — if the block actually has >1 activity the prompt
// shouldn't have surfaced; we bail rather than mid-batch the
// delete.

export type DeleteLastBlockActivityResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteLastBlockActivityAction(
  activityId: string,
  choice: 'cascade' | 'preserve'
): Promise<DeleteLastBlockActivityResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, unit_id, block_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity) {
    return { ok: false, error: 'Activity not found or not yours.' };
  }
  if (activity.block_id === null) {
    return { ok: false, error: 'Activity is not inside a block.' };
  }

  const { count: siblingCount, error: countErr } = await supabase
    .from('nclex_programme_activities')
    .select('*', { count: 'exact', head: true })
    .eq('block_id', activity.block_id);
  if (countErr) return { ok: false, error: countErr.message };
  if ((siblingCount ?? 0) !== 1) {
    return {
      ok: false,
      error: 'Block has other activities — use the regular delete flow.',
    };
  }

  const blockId = activity.block_id;

  if (choice === 'cascade') {
    // Delete the block; FK cascade removes the (one) activity.
    const { error } = await supabase
      .from('nclex_programme_blocks')
      .delete()
      .eq('block_id', blockId);
    if (error) return { ok: false, error: error.message };
  } else {
    // Move the activity out as loose, then delete the now-empty
    // block. Two ops; not transactional. If the second fails the
    // UI surfaces an error and a re-run cleans up the empty block.
    const newOrdinal = await nextUnitBodyOrdinal(supabase, activity.unit_id);
    const moveErr = (
      await supabase
        .from('nclex_programme_activities')
        .update({
          block_id: null,
          ordinal: newOrdinal,
          updated_at: new Date().toISOString(),
        })
        .eq('activity_id', activityId)
    ).error;
    if (moveErr) return { ok: false, error: moveErr.message };

    const delErr = (
      await supabase
        .from('nclex_programme_blocks')
        .delete()
        .eq('block_id', blockId)
    ).error;
    if (delErr) return { ok: false, error: delErr.message };
  }

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', activity.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, activity.unit_id);
  }
  return { ok: true };
}
