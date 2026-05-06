// mynclex/lib/bank/builder/types.ts
//
// Shared types for the Practice page. The BuilderState is the single
// source of UI state — every section reads/writes a slice of it.

import type { Intent, ModeId, PoolId } from './filter-config';

export interface BuilderState {
  // Section 1 — pool chips
  pools: Set<PoolId>;
  // Section 2 — content filters (every axis is a Set of DB strings)
  cnc:        Set<string>;
  subcat:     Set<string>;
  subject:    Set<string>;
  body:       Set<string>;
  qtype:      Set<string>;
  diff:       Set<string>;
  tags:       Set<string>;
  topic:      Set<string>;
  subtopic:   Set<string>;
  topicQuery: string;
  // Section 3 — intent + mode
  intent: Intent;
  mode:   ModeId;
  // Sticky summary — count
  count: number;
}

/**
 * The JSONB shape the count + create RPCs accept.
 * See _nclex_eligible_unit_pool in the slice 2.2a migration.
 */
export interface FilterPayload {
  client_needs_category?: string[];
  client_needs_subcategory?: string[];
  nursing_subject?: string[];
  body_system?: string[];
  question_type?: string[];
  difficulty?: string[];
  tags?: string[];
  topic?: string[];
  subtopic?: string[];
  pool_history?: ('UNSEEN' | 'SEEN' | 'CORRECT' | 'INCORRECT')[];
  pool_marked?: boolean;
}

export interface CountResult {
  total: number;
  by_question_type: Record<string, number>;
}
