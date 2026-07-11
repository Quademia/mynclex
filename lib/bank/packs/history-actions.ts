// mynclex/lib/bank/packs/history-actions.ts
//
// Lazy loader for the pack History drawer (the audit READOUT —
// readiness-packs.md §12). A pack's story lives under TWO audit
// entity types written by the Slice-① triggers:
//   • 'readiness_pack'      — the pack row (created / settings edited)
//   • 'readiness_pack_item' — one membership row per question, whose
//     entity_id is the composite '<pack_id>:<item_id>' precisely so
//     these rows stay attributable after the link row is deleted
//     (removal is half of every swap).
// This action merges both into one newest-first timeline and enriches
// membership entries with the question's stem label so the drawer
// reads "Added NCLEX_CS_00018 — <stem…>", not bare ids. A question
// since deleted from the bank falls back to its id alone.
//
// Gate: the shared audit-gate registry (BANK_CURATE via
// resolveAuditGate), the same layered model as the bank drawers — the
// log table's own RLS backs the TS gate.

'use server';

import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { resolveAuditGate } from '@/lib/audit/gates';

export interface PackHistoryEntry {
  kind:          'pack' | 'member';
  action:        'created' | 'updated' | 'deleted';
  /** Membership entries only — the question the entry is about. */
  itemId:        string | null;
  /** Plain-text stem label, when the question still exists in the bank. */
  itemLabel:     string | null;
  changedByName: string | null;
  changedAt:     string;
}

interface LogRow {
  entity_id:       string;
  action:          string;
  changed_by_name: string | null;
  changed_at:      string;
}

function coerceAction(raw: string): PackHistoryEntry['action'] {
  return raw === 'created' || raw === 'deleted' ? raw : 'updated';
}

/** Full change history for one pack, newest first. */
export async function loadPackHistory(packId: string): Promise<PackHistoryEntry[]> {
  const { supabase } = await resolveAuditGate('readiness_pack');

  const [{ data: packRows, error: pErr }, { data: memberRows, error: mErr }] =
    await Promise.all([
      supabase
        .from('nclex_audit_log')
        .select('entity_id, action, changed_by_name, changed_at')
        .eq('entity_type', 'readiness_pack')
        .eq('entity_id', packId),
      supabase
        .from('nclex_audit_log')
        .select('entity_id, action, changed_by_name, changed_at')
        .eq('entity_type', 'readiness_pack_item')
        .like('entity_id', `${packId}:%`),
    ]);
  if (pErr) throw new Error(`Could not load pack history: ${pErr.message}`);
  if (mErr) throw new Error(`Could not load membership history: ${mErr.message}`);

  const entries: PackHistoryEntry[] = [
    ...((packRows ?? []) as LogRow[]).map((r) => ({
      kind:          'pack' as const,
      action:        coerceAction(r.action),
      itemId:        null,
      itemLabel:     null,
      changedByName: r.changed_by_name,
      changedAt:     r.changed_at,
    })),
    ...((memberRows ?? []) as LogRow[]).map((r) => ({
      kind:          'member' as const,
      action:        coerceAction(r.action),
      // Composite id is '<pack_id>:<item_id>'; neither id contains ':'.
      itemId:        r.entity_id.slice(packId.length + 1),
      itemLabel:     null as string | null,
      changedByName: r.changed_by_name,
      changedAt:     r.changed_at,
    })),
  ];

  // Enrich with stem labels (batch adds share a timestamp — the id
  // tie-break below keeps those runs stable too).
  const itemIds = [...new Set(entries.map((e) => e.itemId).filter(Boolean))] as string[];
  if (itemIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('nclex_bank_items')
      .select('item_id, stem')
      .in('item_id', itemIds);
    const labelOf: Record<string, string> = {};
    for (const r of (itemRows ?? []) as { item_id: string; stem: string }[]) {
      labelOf[r.item_id] = richTextToPlainLabel(r.stem);
    }
    for (const e of entries) {
      if (e.itemId) e.itemLabel = labelOf[e.itemId] ?? null;
    }
  }

  return entries.sort(
    (a, b) =>
      b.changedAt.localeCompare(a.changedAt) ||
      (a.itemId ?? '').localeCompare(b.itemId ?? ''),
  );
}
