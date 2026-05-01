// mynclex/lib/bank/wrappers/trend/delete-trend-confirm.tsx
//
// Slice 13e — trend-dataset delete confirmation dialog. Dispatches
// on attached-question count, mirroring the CS pattern at
// delete-case-confirm.tsx.
//
//   - 0 attached → single-path: typed DELETE confirms; deletes the
//                  dataset row.
//   - ≥1 attached → two-path:
//       a) Detach & keep questions  — typed DETACH gates the action.
//          Calls deleteTrendAction with mode='detach-and-delete'.
//       b) Delete everything        — typed DELETE gates the action.
//          Calls deleteTrendAction with mode='delete-everything'.
//
// Backdrop click and Esc map to Cancel (the safe option, per
// CLAUDE.md § UI Conventions).
//
// Reuses CSS classes from the CS dialog (.auth-cs-delete-*) — same
// visual language, no need to duplicate styles. Slice 14 collapses
// the duplication.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { deleteTrendAction, type DeleteTrendMode } from './actions';
import type { Surface } from './types';

interface Props {
  surface:        Surface;
  trendId:        string;
  trendTitle:     string;
  attachedCount:  number;
  onCancel:       () => void;
  onDeleted:      () => void;            // navigate away on success
  onError:        (msg: string) => void;
}

export function DeleteTrendConfirm({
  surface, trendId, trendTitle, attachedCount, onCancel, onDeleted, onError,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [detachInput, setDetachInput] = useState('');
  const [deleteInput, setDeleteInput] = useState('');
  const [simpleInput, setSimpleInput] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function fire(mode: DeleteTrendMode) {
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('trend_id', trendId);
    fd.set('mode', mode);
    startTransition(async () => {
      const res = await deleteTrendAction(fd);
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onDeleted();
    });
  }

  return (
    <div
      className="auth-cs-delete-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="auth-cs-delete-dialog" role="dialog" aria-label="Delete trend dataset">

        {attachedCount === 0 ? (
          // Single-path
          <>
            <h3 className="auth-cs-delete-title">Delete this trend dataset?</h3>
            <p className="auth-cs-delete-body">
              <strong>{trendTitle || '(untitled trend)'}</strong> has no attached questions.
              Deleting drops the dataset row. This cannot be undone.
            </p>
            <div className="auth-cs-delete-gate">
              <label htmlFor="tr-del-simple" className="auth-cs-delete-gate-label">
                Type <code>DELETE</code> to confirm
              </label>
              <input
                id="tr-del-simple"
                type="text"
                value={simpleInput}
                onChange={(e) => setSimpleInput(e.target.value)}
                placeholder="DELETE"
                className="auth-cs-delete-gate-input"
                autoFocus
              />
            </div>
            <div className="auth-cs-delete-actions">
              <button type="button" className="auth-cs-btn subtle" onClick={onCancel} disabled={pending}>
                Cancel
              </button>
              <button
                type="button"
                className="auth-cs-btn"
                style={{ color: 'var(--danger)', borderColor: '#fecaca', background: '#fef2f2' }}
                disabled={pending || simpleInput !== 'DELETE'}
                onClick={() => fire('simple')}
              >
                {pending ? 'Deleting…' : 'Delete dataset'}
              </button>
            </div>
          </>
        ) : (
          // Two-path
          <>
            <h3 className="auth-cs-delete-title">Delete this trend dataset?</h3>
            <p className="auth-cs-delete-body">
              <strong>{trendTitle || '(untitled trend)'}</strong> has {attachedCount}{' '}
              attached question{attachedCount === 1 ? '' : 's'}. Pick how to handle them.
              This cannot be undone.
            </p>

            <div className="auth-cs-delete-paths">
              {/* Path 1 — Detach & keep */}
              <div className="auth-cs-delete-path">
                <h4 className="auth-cs-delete-path-title">Detach &amp; keep questions</h4>
                <p className="auth-cs-delete-path-help">
                  The {attachedCount} question{attachedCount === 1 ? '' : 's'} survive in the
                  bank as standalone. Only the dataset row is deleted.
                </p>
                <label htmlFor="tr-del-detach" className="auth-cs-delete-gate-label">
                  Type <code>DETACH</code> to confirm
                </label>
                <input
                  id="tr-del-detach"
                  type="text"
                  value={detachInput}
                  onChange={(e) => setDetachInput(e.target.value)}
                  placeholder="DETACH"
                  className="auth-cs-delete-gate-input"
                />
                <button
                  type="button"
                  className="auth-cs-btn"
                  style={{ marginTop: 8, width: '100%' }}
                  disabled={pending || detachInput !== 'DETACH'}
                  onClick={() => fire('detach-and-delete')}
                >
                  {pending ? 'Deleting…' : 'Detach & delete dataset'}
                </button>
              </div>

              {/* Path 2 — Delete everything */}
              <div className="auth-cs-delete-path auth-cs-delete-path--danger">
                <h4 className="auth-cs-delete-path-title">Delete everything</h4>
                <p className="auth-cs-delete-path-help">
                  The dataset <strong>and</strong> all {attachedCount}{' '}
                  attached question{attachedCount === 1 ? '' : 's'} are permanently deleted.
                  This will affect any tutor programmes that reference these questions.
                </p>
                <label htmlFor="tr-del-everything" className="auth-cs-delete-gate-label">
                  Type <code>DELETE</code> to confirm
                </label>
                <input
                  id="tr-del-everything"
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  className="auth-cs-delete-gate-input"
                />
                <button
                  type="button"
                  className="auth-cs-btn"
                  style={{
                    marginTop: 8,
                    width: '100%',
                    color: 'var(--danger)',
                    borderColor: '#fecaca',
                    background: '#fef2f2',
                  }}
                  disabled={pending || deleteInput !== 'DELETE'}
                  onClick={() => fire('delete-everything')}
                >
                  {pending ? 'Deleting…' : `Delete dataset + ${attachedCount} question${attachedCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>

            <div className="auth-cs-delete-actions">
              <button type="button" className="auth-cs-btn subtle" onClick={onCancel} disabled={pending}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
