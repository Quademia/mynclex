// mynclex/lib/bank/packs/pack-form-modal.tsx
//
// One form modal for BOTH creating a pack and editing its basics
// (settled 2026-07-08 — the ProgrammeFormModal pattern; the basics
// card's old inline form retired in favour of this). Fields = the
// pack row's curator-ownable columns: title, description, question
// count, time limit. Publishing stays on its own gated card; the id
// is system-minted (lowest free number).
//
// "Intelligent" question count per Sam's call: n is editable (not
// locked to 100), the 100-question standard surfaces as an amber
// ADVISORY (advise > block), and while the curator hasn't touched the
// time field it follows exam pace (2 min × n).

'use client';

import { useState, useTransition } from 'react';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createPackAction, updatePackBasicsAction } from './actions';
import type { PackRow } from './types';

const STANDARD_N = 100;
const EXAM_PACE_MIN_PER_Q = 2;

export function PackFormModal({
  pack,
  memberCount,
  onClose,
  onCreated,
  onSaved,
}: {
  /** Present = edit mode; absent = create mode. */
  pack?: PackRow;
  /** Edit mode: current member count (floor for n). */
  memberCount?: number;
  onClose: () => void;
  onCreated?: (packId: string) => void;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(pack);
  const [title, setTitle] = useState(pack?.title ?? '');
  const [description, setDescription] = useState(pack?.description ?? '');
  const [n, setN] = useState(pack?.n ?? STANDARD_N);
  const [time, setTime] = useState(
    pack ? Math.round((pack.time_limit_sec ?? 0) / 60) : STANDARD_N * EXAM_PACE_MIN_PER_Q,
  );
  const [timeTouched, setTimeTouched] = useState(isEdit);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const floor = memberCount ?? 0;
  const nBelowMembers = isEdit && Number.isFinite(n) && n < floor;

  const changeN = (value: number) => {
    setN(value);
    // Exam-pace suggestion follows n until the curator claims the field.
    if (!timeTouched && Number.isFinite(value) && value >= 1) {
      setTime(value * EXAM_PACE_MIN_PER_Q);
    }
  };

  const submit = () => {
    const fd = new FormData();
    if (pack) fd.set('pack_id', pack.pack_id);
    fd.set('title', title);
    fd.set('description', description);
    fd.set('n', String(n));
    fd.set('time_limit_min', String(time));

    startTransition(async () => {
      if (pack) {
        const res = await updatePackBasicsAction(fd);
        if (!res.ok) {
          setError(res.error ?? 'Save failed.');
          return;
        }
        onSaved?.();
      } else {
        const res = await createPackAction(fd);
        if (!res.ok || !res.packId) {
          setError(res.error ?? 'Create failed.');
          return;
        }
        onCreated?.(res.packId);
      }
    });
  };

  return (
    <div
      className="rp-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="rp-modal" role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit pack' : 'New pack'}>
        <div className="rp-modal-head">
          <h3>{isEdit ? 'Edit pack' : 'New readiness pack'}</h3>
          {isEdit && <span className="rp-mono">{pack!.pack_id}</span>}
        </div>

        <div className="rp-basics-form">
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={!isEdit}
              disabled={pending}
            />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
            />
          </label>
          <div className="rp-modal-num-row">
            <label>
              Question count
              <input
                type="number"
                className="rp-input-narrow"
                min={Math.max(1, floor)}
                value={Number.isFinite(n) ? n : ''}
                onChange={(e) => changeN(parseInt(e.target.value, 10))}
                disabled={pending}
              />
            </label>
            <label>
              Time limit (minutes)
              <input
                type="number"
                className="rp-input-narrow"
                min={1}
                value={Number.isFinite(time) ? time : ''}
                onChange={(e) => {
                  setTimeTouched(true);
                  setTime(parseInt(e.target.value, 10));
                }}
                disabled={pending}
              />
            </label>
          </div>

          {nBelowMembers && (
            <p className="rp-modal-advice block">
              This pack already holds {floor} questions — remove some before
              lowering the count to {n}.
            </p>
          )}
          {!nBelowMembers && Number.isFinite(n) && n !== STANDARD_N && (
            <p className="rp-modal-advice">
              The standard readiness pack is {STANDARD_N} questions — a
              different count is allowed, but the mock reads less like the
              real exam.
            </p>
          )}
          {!timeTouched && (
            <p className="rp-modal-hint">
              Time limit follows exam pace ({EXAM_PACE_MIN_PER_Q} min ×{' '}
              {Number.isFinite(n) ? n : '…'} questions) until you set it yourself.
            </p>
          )}

          <div className="rp-form-actions">
            <button
              type="button"
              className="rp-btn-primary"
              disabled={pending || !title.trim() || nBelowMembers}
              onClick={submit}
            >
              {pending
                ? isEdit ? 'Saving…' : 'Creating…'
                : isEdit ? 'Save' : 'Create pack'}
            </button>
            <button
              type="button"
              className="rp-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>

        <ErrorToast error={error} onDismiss={() => setError(null)} />
      </div>
    </div>
  );
}
