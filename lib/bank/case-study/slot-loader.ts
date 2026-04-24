// mynclex/lib/bank/case-study/slot-loader.ts
//
// Server-side loader for the six Q1-Q6 slot drafts on a case study.
// Shared by the admin and tutor case editor pages so both surfaces
// build their `CaseStudyEditorInitial.slots` array identically.
//
// Returns length-6 array indexed by position. Empty positions come
// back as { position, item_id: null, cjmm_step: null, initial: null }.
//
// Placement. Sits in lib/bank/case-study/ rather than next to the
// admin/bank parsers because (a) it's case-study-specific (reads the
// nclex_case_study_items join + the linked bank_items rows), (b) both
// the admin and tutor surface pages call it, and (c) it uses
// rowToInitial from lib/bank/list-view.tsx — the canonical DB-row →
// BankFormInitial helper. If rowToInitial's output shape changes,
// this loader inherits the change for free.
//
// Drift note. This is the LOAD path in a three-entry loop:
//   DB row       →  BankFormInitial         (rowToInitial, via loadCaseSlots)
//   FormData     →  BankFormInitial         (parseSlotFormData)
//   BankFormInitial → RPC payload (save)    (initialToParsedItem)
// See the drift-trap comments in app/(app)/admin/bank/slot-parser.ts
// and initial-to-parsed.ts for the save-path invariant.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseStudySlotRow } from './types';
import type { Surface } from './types';
import type { CjmmStep } from '../classifications';
import { rowToInitial, type FullBankRow } from '../list-view';

function tableNames(surface: Surface) {
  if (surface === 'tutor') {
    return {
      joinTable:   'nclex_tutor_case_study_items' as const,
      itemsTable:  'nclex_tutor_questions' as const,
    };
  }
  return {
    joinTable:   'nclex_case_study_items' as const,
    itemsTable:  'nclex_bank_items' as const,
  };
}

interface JoinRow {
  position:  number;
  item_id:   string;
  cjmm_step: string;
}

export async function loadCaseSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  case_id: string,
  surface: Surface,
): Promise<CaseStudySlotRow[]> {
  const { joinTable, itemsTable } = tableNames(surface);

  const joinRes = await supabase
    .from(joinTable)
    .select('position, item_id, cjmm_step')
    .eq('case_id', case_id)
    .order('position', { ascending: true });

  const joins = (joinRes.data ?? []) as JoinRow[];

  // Fetch all linked bank item rows in one round-trip.
  const itemIds = joins.map((j) => j.item_id);
  let fullRows: FullBankRow[] = [];
  if (itemIds.length > 0) {
    const itemsRes = await supabase
      .from(itemsTable)
      .select('*')
      .in('item_id', itemIds);
    fullRows = (itemsRes.data ?? []) as FullBankRow[];
  }
  const byItemId = new Map<string, FullBankRow>(
    fullRows.map((r) => [r.item_id, r]),
  );

  // Build length-6 slot array.
  const byPosition = new Map<number, JoinRow>(
    joins.map((j) => [j.position, j]),
  );

  const slots: CaseStudySlotRow[] = [];
  for (let pos = 1; pos <= 6; pos++) {
    const join = byPosition.get(pos);
    if (!join) {
      slots.push({ position: pos, item_id: null, cjmm_step: null, initial: null });
      continue;
    }
    const fullRow = byItemId.get(join.item_id);
    if (!fullRow) {
      // Join row points to a row we couldn't load (RLS or missing). Treat
      // as empty — a future save would try to re-insert, which is better
      // than crashing the editor.
      slots.push({ position: pos, item_id: null, cjmm_step: null, initial: null });
      continue;
    }
    slots.push({
      position: pos,
      item_id:  join.item_id,
      cjmm_step: join.cjmm_step as CjmmStep,
      initial:  rowToInitial(fullRow),
    });
  }

  return slots;
}
