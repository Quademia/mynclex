// mynclex/lib/bank/builder/build-filter-payload.ts
//
// Turns the in-UI BuilderState into the JSONB shape the count + create
// RPCs accept (FilterPayload). The mapping is mostly literal — Sets
// become arrays of the same DB string values — with two pieces of UI-
// specific translation:
//
//   1. Pool chips → pool_history + pool_marked
//      • 'SEEN' chip is a UI fiction (= CORRECT ∪ INCORRECT). Expand
//        to those two history values.
//      • 'ALL' chip is a shortcut that the UI uses to auto-toggle the
//        other 5 chips; once expanded by the UI, it doesn't itself
//        contribute. The payload-builder treats 'ALL' the same as
//        having all 5 individual chips selected.
//      • 'MARKED' chip → pool_marked: true.
//
//   2. Smart-linked rows are dropped from the payload.
//      A subcat whose parent CNC isn't selected is dimmed in the UI
//      and shouldn't be sent to the backend even if the BuilderState
//      somehow holds it (defensive). Same for body system w/ subject.

import {
  subcatAvailableFor,
  bodyAvailableFor,
} from './filter-config';
import type { BuilderState, FilterPayload } from './types';

export function buildFilterPayload(s: BuilderState): FilterPayload {
  const out: FilterPayload = {};

  // Content axes — only include if non-empty (RPC treats empty/missing
  // as "no filter on this axis", same effect either way, but tighter
  // payloads are easier to inspect in logs).
  if (s.cnc.size      > 0) out.client_needs_category    = [...s.cnc];
  if (s.subject.size  > 0) out.nursing_subject          = [...s.subject];
  if (s.qtype.size    > 0) out.question_type            = [...s.qtype];
  if (s.diff.size     > 0) out.difficulty               = [...s.diff];
  if (s.tags.size     > 0) out.tags                     = [...s.tags];
  if (s.topic.size    > 0) out.topic                    = [...s.topic];
  if (s.subtopic.size > 0) out.subtopic                 = [...s.subtopic];

  // Smart-linked: drop rows whose parent isn't selected.
  if (s.subcat.size > 0) {
    const visible = [...s.subcat].filter((sub) => subcatAvailableFor(sub, s.cnc));
    if (visible.length > 0) out.client_needs_subcategory = visible;
  }
  if (s.body.size > 0) {
    const visible = [...s.body].filter((b) => bodyAvailableFor(b, s.subject));
    if (visible.length > 0) out.body_system = visible;
  }

  // Pool — translate chips → (pool_history, pool_marked).
  const history: ('UNSEEN' | 'SEEN' | 'CORRECT' | 'INCORRECT')[] = [];
  const has = (id: string) => s.pools.has(id as never);

  // 'ALL' shortcut: equivalent to all 5 individual chips ticked.
  // Note: actually we send only the 4 base history values; CORRECT and
  // INCORRECT cover SEEN, plus UNSEEN. So all = unseen + correct +
  // incorrect.
  const allOn = has('ALL');

  if (allOn || has('UNSEEN'))    history.push('UNSEEN');
  if (allOn || has('CORRECT'))   history.push('CORRECT');
  if (allOn || has('INCORRECT')) history.push('INCORRECT');
  // 'SEEN' chip = CORRECT ∪ INCORRECT (which we already include if
  // SEEN is on; dedupe via Set).
  if (has('SEEN')) {
    if (!history.includes('CORRECT'))   history.push('CORRECT');
    if (!history.includes('INCORRECT')) history.push('INCORRECT');
  }
  // The RPC's helper uses pool_history as-is. If it's empty, no history
  // constraint is applied (= every state). That's the correct semantics
  // when no chip is on.
  if (history.length > 0) out.pool_history = history;

  if (allOn || has('MARKED')) out.pool_marked = true;

  return out;
}
