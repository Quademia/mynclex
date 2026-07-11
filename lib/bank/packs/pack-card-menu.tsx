// mynclex/lib/bank/packs/pack-card-menu.tsx
//
// The card-corner ⋮ menu on /admin/packs (2026-07-08) — Edit · Publish
// · Delete at the list level, so the curator doesn't have to open a
// pack for its lifecycle. Pure COMPOSITION, the programme-card-menu
// pattern: every dialog already exists.
//   • Edit    → the shared PackFormModal (edit mode).
//   • Publish → a popup hosting the SAME <PublishPanel> as the detail
//               sidebar (gate fetched lazily via loadPackGateAction;
//               stays open so the curator sees the checklist flip).
//   • Delete  → PackDeleteConfirm; DISABLED on published packs with an
//               "unpublish first" tooltip (teaches the rule).
// Sits as a sibling of the card's <Link>; clicks stop propagation so
// the card doesn't navigate.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { PackDeleteConfirm } from '@/lib/overlays/bank/pack-delete-confirm';
import { deletePackAction, loadPackGateAction } from './actions';
import { PublishPanel } from './composition-cards';
import { PackFormModal } from './pack-form-modal';
import type { PackGate } from './composition';
import type { PackOverview } from './types';

export function PackCardMenu({ pack }: { pack: PackOverview }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    fn();
  };

  const confirmDelete = () => {
    startTransition(async () => {
      const res = await deletePackAction(pack.pack_id);
      if (!res.ok) {
        setError(res.error ?? 'Delete failed.');
        setDeleteOpen(false);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="rp-card-menu" ref={ref}>
      <button
        type="button"
        className="rp-card-menu-btn"
        aria-label={`Actions for ${pack.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋮
      </button>

      {open && (
        <div className="rp-card-menu-pop" role="menu">
          <button type="button" className="rp-card-menu-item" onClick={item(() => setEditOpen(true))}>
            Edit
          </button>
          <button type="button" className="rp-card-menu-item" onClick={item(() => setPublishOpen(true))}>
            Publishing…
          </button>
          <button
            type="button"
            className="rp-card-menu-item is-danger"
            disabled={pack.published}
            title={pack.published ? 'A published pack cannot be deleted — unpublish it first.' : undefined}
            onClick={item(() => setDeleteOpen(true))}
          >
            Delete…
          </button>
        </div>
      )}

      {editOpen && (
        <PackFormModal
          pack={pack}
          memberCount={pack.count}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      )}

      {publishOpen && (
        <PackPublishModal pack={pack} onClose={() => setPublishOpen(false)} />
      )}

      {deleteOpen && (
        <PackDeleteConfirm
          packId={pack.pack_id}
          memberCount={pack.count}
          pending={pending}
          onCancel={() => {
            if (!pending) setDeleteOpen(false);
          }}
          onConfirm={confirmDelete}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

// ── The Publishing popup ─────────────────────────────────────────────
// Same <PublishPanel> as the detail sidebar, in a centred modal. The
// gate loads lazily on open (the list page doesn't carry membership),
// and re-loads after every successful toggle so the curator watches
// the checklist + state line change without the popup closing.

function PackPublishModal({
  pack,
  onClose,
}: {
  pack: PackOverview;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; error: string }
    | { kind: 'ready'; published: boolean; gate: PackGate }
  >({ kind: 'loading' });
  const inFlight = useRef(false);

  useEffect(() => {
    if (state.kind !== 'loading' || inFlight.current) return;
    inFlight.current = true;
    loadPackGateAction(pack.pack_id).then((res) => {
      inFlight.current = false;
      setState(
        res.ok
          ? { kind: 'ready', published: res.published, gate: res.gate }
          : { kind: 'error', error: res.error },
      );
    });
  }, [state, pack.pack_id]);

  return (
    <div
      className="rp-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rp-modal" role="dialog" aria-modal="true" aria-label="Publishing">
        <div className="rp-modal-head">
          <h3>{pack.title}</h3>
          <span className="rp-mono">{pack.pack_id}</span>
        </div>

        {state.kind === 'loading' && (
          <p className="rp-dim">Checking the publish checklist…</p>
        )}
        {state.kind === 'error' && (
          <p className="rp-modal-advice block">{state.error}</p>
        )}
        {state.kind === 'ready' && (
          <PublishPanel
            packId={pack.pack_id}
            published={state.published}
            gate={state.gate}
            onChanged={() => {
              setState({ kind: 'loading' }); // re-fetch → checklist updates in place
              router.refresh();
            }}
          />
        )}

        <div className="rp-form-actions">
          <button type="button" className="rp-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
