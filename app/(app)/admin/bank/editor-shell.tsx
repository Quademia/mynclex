// mynclex/app/(app)/admin/bank/editor-shell.tsx
//
// Shell for the standalone bank authoring page (/admin/bank → create
// and /tutor/bank → create, plus each surface's ?edit={item_id} path).
// Owns the form wrapper, the sticky topbar with Save / Delete / Cancel,
// the server-action wiring, and the flash/error display.
//
// Slice 1.11b: the ~80% of the form body that every question type
// shares (Content / Classification / Housekeeping accordions plus the
// per-type editor delegated by `type`) is extracted into
// QuestionAuthoringPanel. The shell mounts that panel with
// mode='standalone' and fieldPrefix=''. Behaviour-equivalent to pre-1.11b
// editor-shell; the extraction lets the same panel mount inside the
// Case Study editor's right pane in Phase 3.
//
// Editor components inside the panel render inputs with `name=`
// attributes, so their values flow straight into this shell's
// FormData — no manual marshalling needed.

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  createBankItemAction,
  updateBankItemAction,
  deleteBankItemAction,
  type ActionResult,
} from './actions';
import type { BankFormInitial } from '@/lib/bank/form-shape';
import { QuestionAuthoringPanel } from '@/lib/bank/question-authoring-panel';

export function EditorShell({
  initial,
  savedFlash,
  cancelHref = '/admin/bank',
  surface = 'admin',
}: {
  initial: BankFormInitial;
  savedFlash: boolean;
  cancelHref?: string;
  // Slice 2.1: which bank surface owns this row. Passed through to the
  // server actions via a hidden input so create/update/delete can pick
  // the right table and role gate.
  surface?: 'admin' | 'tutor';
}) {
  const isEdit = initial.item_id !== null;

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const action = isEdit ? updateBankItemAction : createBankItemAction;
      const result: ActionResult | void = await action(formData);
      // Server Actions that redirect throw NEXT_REDIRECT; we only get a
      // result back on the failure branch.
      if (result && result.ok === false) {
        setError(result.error);
      }
    });
  }

  function onDelete() {
    if (!isEdit || !initial.item_id) return;
    if (!confirm(`Delete ${initial.item_id}? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set('item_id', initial.item_id);
    fd.set('surface', surface);
    startTransition(async () => {
      const result: ActionResult | void = await deleteBankItemAction(fd);
      if (result && result.ok === false) {
        setError(result.error);
      }
    });
  }

  return (
    <form className="bank-form" onSubmit={onSubmit}>
      {/* surface tells the action which table to write to (admin →
          nclex_bank_items, tutor → nclex_tutor_questions). question_type
          and item_id hidden inputs are rendered by the panel. */}
      <input type="hidden" name="surface" value={surface} />

      {/* Sticky top action bar: Save / Delete / Cancel stay visible as
          the user scrolls through the form body. */}
      <div className="bank-form-topbar">
        <h2 className="bank-form-topbar-title">
          {isEdit ? `Edit ${initial.item_id}` : 'New Question'}
        </h2>
        <div className="bank-form-topbar-actions">
          <Link href={cancelHref} className="bank-btn bank-btn-ghost">
            Cancel
          </Link>
          {isEdit && (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="bank-btn bank-btn-danger"
            >
              Delete
            </button>
          )}
          <button type="submit" disabled={pending} className="bank-btn bank-btn-primary">
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create question'}
          </button>
        </div>
      </div>

      {savedFlash && !error && (
        <div className="bank-form-flash">Saved ✓</div>
      )}
      {error && (
        <div className="bank-form-error">{error}</div>
      )}

      <QuestionAuthoringPanel mode="standalone" fieldPrefix="" initial={initial} />
    </form>
  );
}
