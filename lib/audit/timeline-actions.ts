// mynclex/lib/audit/timeline-actions.ts
//
// Lazy half of the authorship feature: the FULL append-only timeline
// for one entity, loaded on demand when the curator opens the History
// drawer (history-drawer.tsx). Kept out of the eager page query so a
// list of 40 rows never pre-loads 40 timelines — only the one clicked.
//
// Security is layered: the action re-gates via the per-entity-type gate
// registry (gates.ts) AND the underlying log tables carry RLS (admin log
// = BANK_CURATE holders; tutor log = owner + SUPER_ADMIN). The request-
// scoped client respects that RLS, so a caller only ever sees rows they
// are entitled to even if the entity_id were guessed.

'use server';

import { AUDIT_TABLE, loadAuthorship, type Authorship, type AuditRealm } from './authorship';
import { resolveAuditGate } from './gates';

const EMPTY_AUTHORSHIP: Authorship = {
  createdByName:    null,
  createdAt:        null,
  lastEditedByName: null,
  lastEditedAt:     null,
  hasEdits:         false,
  hasAny:           false,
};

/**
 * Single-entity authorship facts, fetched on demand by surfaces that
 * mount client-side with no server round-trip — the question editors,
 * which open in a pop-up AND embedded in a wrapper. Reuses the batched
 * loadAuthorship helper (for one id) behind the same per-entity-type
 * gate as the timeline. Returns an all-empty record for entities that
 * predate tracking.
 */
export async function loadAuthorshipFactsAction(
  realm:      AuditRealm,
  entityType: string,
  entityId:   string,
): Promise<Authorship> {
  const { supabase } = await resolveAuditGate(entityType);
  const map = await loadAuthorship(supabase, realm, entityType, [entityId]);
  return map[entityId] ?? EMPTY_AUTHORSHIP;
}

export interface TimelineEntry {
  action:        'created' | 'updated';
  changedByName: string | null;
  changedAt:     string;
}

interface TimelineRow {
  action:          string;
  changed_by_name: string | null;
  changed_at:      string;
}

/**
 * Newest-first change history for a single entity. Empty array when the
 * entity predates tracking (or the caller can't see it under RLS).
 */
export async function loadAuditTimeline(
  realm:      AuditRealm,
  entityType: string,
  entityId:   string,
): Promise<TimelineEntry[]> {
  const { supabase } = await resolveAuditGate(entityType);

  const { data, error } = await supabase
    .from(AUDIT_TABLE[realm])
    .select('action, changed_by_name, changed_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('changed_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const row = r as TimelineRow;
    return {
      action:        row.action === 'updated' ? 'updated' : 'created',
      changedByName: row.changed_by_name,
      changedAt:     row.changed_at,
    };
  });
}
