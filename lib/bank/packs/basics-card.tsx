// mynclex/lib/bank/packs/basics-card.tsx
//
// "Pack basics" sidebar card. Reworked 2026-07-08: read-only display
// of the pack row's curator-ownable fields (id · title · description ·
// question count · time limit) — the old inline form retired in
// favour of the shared create/edit <PackFormModal>. Also hosts Delete
// (never-sold packs only; published packs hide the button and the
// server refuses them regardless — layered enforcement).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { PackDeleteConfirm } from '@/lib/overlays/bank/pack-delete-confirm';
import { deletePackAction } from './actions';
import { PackFormModal } from './pack-form-modal';
import type { PackRow } from './types';

export function PackBasicsCard({
  pack,
  memberCount,
}: {
  pack: PackRow;
  memberCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const timeLimitMin = Math.round((pack.time_limit_sec ?? 0) / 60);

  const runDelete = () => {
    startTransition(async () => {
      const res = await deletePackAction(pack.pack_id);
      if (!res.ok) {
        setError(res.error ?? 'Delete failed.');
        setConfirmingDelete(false);
        return;
      }
      router.push('/admin/packs');
      router.refresh();
    });
  };

  return (
    <section className="rp-card rp-side-card">
      <div className="rp-side-card-head">
        <h3>Pack basics</h3>
        <button type="button" className="rp-btn-ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      <div className="rp-basics-view">
        <div>
          <span className="rp-field-label">Pack id</span>
          <span className="rp-mono">{pack.pack_id}</span>
        </div>
        <div>
          <span className="rp-field-label">Title</span>
          <span>{pack.title}</span>
        </div>
        <div>
          <span className="rp-field-label">Description</span>
          <span className={pack.description ? '' : 'rp-dim'}>
            {pack.description || 'No description yet — shown to students on the catalogue.'}
          </span>
        </div>
        <div>
          <span className="rp-field-label">Question count</span>
          <span>
            {pack.n ?? 100} questions
            {(pack.n ?? 100) !== 100 && (
              <span className="rp-dim"> · standard is 100</span>
            )}
          </span>
        </div>
        <div>
          <span className="rp-field-label">Time limit</span>
          <span>{formatTime(timeLimitMin)} · exam pace (2 min / question)</span>
        </div>
      </div>

      {!pack.published && (
        <div className="rp-basics-danger">
          <button
            type="button"
            className="rp-btn-ghost rp-btn-danger-ghost"
            disabled={pending}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete pack…
          </button>
          <span className="rp-dim">
            {memberCount > 0
              ? 'Questions return to the unassigned reserve.'
              : 'Only unpublished packs can be deleted.'}
          </span>
        </div>
      )}

      {editing && (
        <PackFormModal
          pack={pack}
          memberCount={memberCount}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}

      {confirmingDelete && (
        <PackDeleteConfirm
          packId={pack.pack_id}
          memberCount={memberCount}
          pending={pending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={runDelete}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </section>
  );
}

function formatTime(min: number): string {
  if (!min || min <= 0) return 'Not set';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
