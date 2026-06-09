// mynclex/lib/audit/authorship.ts
//
// Product-wide authorship readout — the "who created / who last edited"
// facts read from the Step-1 audit logs (see
// docs/product-plan/audit-log.md). Built bank-first but realm-generic:
// library / quizzes / programmes fold in by passing a different
// entity_type, no new code here.
//
// This module is the EAGER half: a single batched query resolves the
// created / last-edited names for a whole page of rows at once. The
// full per-entity timeline is loaded lazily on demand — see
// timeline-actions.ts.
//
//   • realm 'admin' → nclex_audit_log        (gated by BANK_CURATE)
//   • realm 'tutor' → nclex_tutor_audit_log   (scoped to the owner)
//
// Names are read straight from the log's point-in-time changed_by_name
// column — no lookup through nclex_users' locked-down RLS (that's the
// whole reason Step 1 stores the name at write time).

import type { ServerSupabaseClient } from '@/lib/access';

export type AuditRealm = 'admin' | 'tutor';

/** Which log table backs each realm. Shared with timeline-actions.ts. */
export const AUDIT_TABLE: Record<AuditRealm, string> = {
  admin: 'nclex_audit_log',
  tutor: 'nclex_tutor_audit_log',
};

export interface Authorship {
  /** Name on the 'created' row, or null if the item predates tracking. */
  createdByName:    string | null;
  createdAt:        string | null;
  /** Name on the newest row of any action. */
  lastEditedByName: string | null;
  lastEditedAt:     string | null;
  /** True once at least one 'updated' row exists (a real edit, not just creation). */
  hasEdits:         boolean;
  /** True if the entity has any audit row at all (else it predates tracking). */
  hasAny:           boolean;
}

interface AuditRow {
  entity_id:       string;
  action:          string;
  changed_by_name: string | null;
  changed_at:      string;
}

/**
 * Batch-resolve authorship facts for many entities of one type in a
 * single query. Returns a map keyed by entity_id; ids with no audit
 * history are simply absent (callers render "—").
 */
export async function loadAuthorship(
  supabase:   ServerSupabaseClient,
  realm:      AuditRealm,
  entityType: string,
  entityIds:  string[],
): Promise<Record<string, Authorship>> {
  const out: Record<string, Authorship> = {};
  if (entityIds.length === 0) return out;

  const { data } = await supabase
    .from(AUDIT_TABLE[realm])
    .select('entity_id, action, changed_by_name, changed_at')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
    .order('changed_at', { ascending: true });

  for (const row of (data ?? []) as AuditRow[]) {
    const e = (out[row.entity_id] ??= {
      createdByName:    null,
      createdAt:        null,
      lastEditedByName: null,
      lastEditedAt:     null,
      hasEdits:         false,
      hasAny:           false,
    });
    e.hasAny = true;
    if (row.action === 'created' && e.createdAt === null) {
      e.createdByName = row.changed_by_name;
      e.createdAt     = row.changed_at;
    }
    if (row.action === 'updated') {
      e.hasEdits = true;
    }
    // Ascending order → the last row we touch is the newest edit.
    e.lastEditedByName = row.changed_by_name;
    e.lastEditedAt     = row.changed_at;
  }
  return out;
}
