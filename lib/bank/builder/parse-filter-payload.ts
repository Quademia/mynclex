// mynclex/lib/bank/builder/parse-filter-payload.ts
//
// Inverse of build-filter-payload.ts. Takes a saved FilterPayload (the
// JSONB column on nclex_attempts.filters_json) and reconstructs a
// Partial<BuilderState> — Sets per axis + the pool chip set.
//
// Used by the Recent Quizzes shortcut: clicking a chip means "restore
// this exact configuration into the form." The page-level handler
// calls parseFilterPayload on the saved payload and uses each Set to
// drive the corresponding state setter.
//
// Lossy inversion note: the saved payload doesn't tell us whether the
// student originally clicked the All shortcut chip or ticked the 5
// individual chips manually — both produce no pool_history + no
// pool_marked. We default to the LITERAL reconstruction (no chip set)
// when both are absent. The student can re-click All if they want.

import type { PoolId } from './filter-config';
import type { BuilderState, FilterPayload } from './types';

export interface ParsedFilters {
  pools: Set<PoolId>;
  cnc:        Set<string>;
  subcat:     Set<string>;
  subject:    Set<string>;
  body:       Set<string>;
  qtype:      Set<string>;
  diff:       Set<string>;
  tags:       Set<string>;
  topic:      Set<string>;
  subtopic:   Set<string>;
}

export function parseFilterPayload(p: FilterPayload | null | undefined): ParsedFilters {
  const f = p ?? {};

  const pools = new Set<PoolId>();
  const history = f.pool_history ?? [];
  // Each saved history value maps to a chip directly. SEEN is unusual
  // (UI-only fiction) — we'd never see it in a saved payload because
  // build-filter-payload always expanded it to CORRECT/INCORRECT before
  // sending. So the history list contains only UNSEEN/CORRECT/INCORRECT.
  for (const h of history) {
    if (h === 'UNSEEN' || h === 'CORRECT' || h === 'INCORRECT' || h === 'SEEN') {
      pools.add(h as PoolId);
    }
  }
  if (f.pool_marked === true) pools.add('MARKED');

  return {
    pools,
    cnc:      new Set(f.client_needs_category ?? []),
    subcat:   new Set(f.client_needs_subcategory ?? []),
    subject:  new Set(f.nursing_subject ?? []),
    body:     new Set(f.body_system ?? []),
    qtype:    new Set(f.question_type ?? []),
    diff:     new Set(f.difficulty ?? []),
    tags:     new Set(f.tags ?? []),
    topic:    new Set(f.topic ?? []),
    subtopic: new Set(f.subtopic ?? []),
  };
}

// Re-export the BuilderState type alias for convenience — callers
// often import both from this module.
export type { BuilderState };
