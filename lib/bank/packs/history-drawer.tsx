// mynclex/lib/bank/packs/history-drawer.tsx
//
// The pack History drawer (the audit READOUT — readiness-packs.md
// §12): the standard 🕑 trigger on the pack detail header opening the
// shared AuditDrawerShell, with pack-flavoured timeline rows the bank
// drawer doesn't have — membership adds/removes ('deleted' pips) and
// question id + stem lines under the action. This is how curators
// review each other's changes on a shared pack, and the §6
// no-membership-lock decision's answer to "which questions did this
// pack hold on date X".

'use client';

import { useState } from 'react';
import { AuditDrawerShell, formatWhen } from '@/lib/audit/history-drawer';
import { loadPackHistory, type PackHistoryEntry } from './history-actions';

export function PackHistoryButton({
  packId,
  packTitle,
}: {
  packId:    string;
  packTitle: string;
}) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<PackHistoryEntry[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function openDrawer() {
    setOpen(true);
    if (entries !== null || loading) return; // already loaded / loading
    setLoading(true);
    setError(null);
    try {
      setEntries(await loadPackHistory(packId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="audit-history-btn"
        onClick={openDrawer}
        title="View change history"
        aria-label="View change history"
      >
        <span aria-hidden="true">🕑</span>
      </button>
      {open && (
        <AuditDrawerShell title={packTitle} onClose={() => setOpen(false)}>
          {loading && <p className="audit-drawer-muted">Loading history…</p>}

          {error && <p className="audit-drawer-error">{error}</p>}

          {!loading && !error && entries && entries.length === 0 && (
            <p className="audit-drawer-muted">No recorded history yet.</p>
          )}

          {!loading && !error && entries && entries.length > 0 && (
            <ol className="audit-timeline">
              {entries.map((e, i) => (
                <li key={i} className="audit-timeline-row">
                  <span
                    className={`audit-timeline-pip ${pipClass(e)}`}
                    aria-hidden="true"
                  />
                  <div className="audit-timeline-text">
                    <span className="audit-timeline-action">
                      {verb(e)}
                      {' by '}
                      <strong>{e.changedByName ?? 'System'}</strong>
                    </span>
                    {e.itemId && (
                      <span className="audit-timeline-item">
                        <span className="rp-mono">{e.itemId}</span>
                        {e.itemLabel && <> — {e.itemLabel}</>}
                      </span>
                    )}
                    <span className="audit-timeline-when">{formatWhen(e.changedAt)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </AuditDrawerShell>
      )}
    </>
  );
}

/** Pack rows read as lifecycle events; member rows as add/move/remove. */
function verb(e: PackHistoryEntry): string {
  if (e.kind === 'pack') {
    if (e.action === 'created') return 'Pack created';
    if (e.action === 'deleted') return 'Pack deleted';
    return 'Pack settings edited';
  }
  if (e.action === 'created') return 'Question added';
  if (e.action === 'deleted') return 'Question removed';
  return 'Question moved'; // link-row updates are position changes
}

function pipClass(e: PackHistoryEntry): string {
  if (e.action === 'deleted') return 'deleted';
  return e.action; // 'created' | 'updated' — the bank drawer's palette
}
