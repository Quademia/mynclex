// mynclex/lib/bank/trend/child-draft.ts
//
// Per-question draft state for the trend editor's right pane
// (Slice 1.12b). One draft per attached question. Drafts live in
// component state; they're serialised to the save payload on Save.
//
// State lifecycle:
//   • `loadChildDraft(row)` — curator opens the editor; each
//     attached `nclex_bank_items` row is converted to a draft via
//     rowToInitial. `item_id` is the row's persisted id,
//     `isDirty` is FALSE, `toDelete` is FALSE.
//   • `emptyChildDraft()` — curator clicks `+ Add question`. A
//     fresh BankFormInitial seeds the draft; `item_id` is null
//     (server mints on save); `isDirty` starts TRUE so the topbar
//     dirty indicator lights up.
//   • Curator edits fields → `isDirty` flips TRUE (set by the
//     editor's onChange handler).
//   • Curator clicks Delete on the active pane → `toDelete` flips
//     TRUE; the pill stays visible until Save unloads it. The
//     editor's save handler splits drafts into "save" vs "delete"
//     buckets based on this flag.
//
// Separate from case-study's slot drafts (which use fixed 6
// positions + CJMM step) — trend questions are variable-count,
// no position, no CJMM. Mirrors the case-study pattern, does not
// reuse it.

import type { BankFormInitial } from '../form-shape';
import { emptyInitial } from '../form-shape';
import { rowToInitial, type FullBankRow } from '../list-view';

export interface TrendChildDraft {
  // Persisted item_id if this draft corresponds to an existing row;
  // null if the curator added it this session and Save hasn't run
  // yet. The save RPC mints the id server-side when null.
  item_id:  string | null;
  initial:  BankFormInitial;
  isDirty:  boolean;
  // Marked for deletion. The pill is still shown (so the curator
  // can undo by Cancel) but excluded from the save payload's
  // "questions" array and instead added to `deleted_item_ids`.
  // Drafts with `item_id === null && toDelete === true` are
  // discarded entirely — nothing to delete server-side.
  toDelete: boolean;
}

// Create a fresh child draft for a freshly-added question slot.
// Starts dirty so the editor's topbar reflects the unsaved pill.
export function emptyChildDraft(): TrendChildDraft {
  return {
    item_id:  null,
    initial:  emptyInitial(),
    isDirty:  true,
    toDelete: false,
  };
}

// Convert an existing bank-item row into a child draft. Matches
// the shape the standalone bank editor loads for ?edit= via
// rowToInitial — so the QuestionAuthoringPanel mounts the same way
// it would if the curator opened the item via /admin/bank.
export function loadChildDraft(row: FullBankRow): TrendChildDraft {
  return {
    item_id:  row.item_id,
    initial:  rowToInitial(row),
    isDirty:  false,
    toDelete: false,
  };
}
