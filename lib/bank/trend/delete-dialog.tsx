// mynclex/lib/bank/trend/delete-dialog.tsx
//
// Slice 1.12c — modal confirmation for dataset deletion.
//
// Branches on attached-items count:
//   • 0 attached → simple one-path confirmation. Typed DELETE
//     enables the confirm button. Fires the existing
//     deleteTrendAction (bare delete, which the server action still
//     accepts for zero-child datasets).
//   • ≥1 attached → list the attached items (item_id + type badge +
//     80-char stem preview) and offer two radio-ish choice cards:
//       - Detach and delete dataset   → detachAndDeleteTrendAction
//       - Delete everything           → deleteTrendAndChildrenAction
//     Typed DELETE enables the confirm button; the button's label
//     + behaviour depends on which card is selected.
//
// This component DOES NOT call the server actions itself. It calls
// back into the editor via the three onXxx props, which then build
// FormData and invoke the right action. Keeps the dialog stateless
// beyond local UI state (selected choice + typed text).
//
// Attached-items filter — unsaved drafts (`item_id === null`) must
// NOT appear in the list. They haven't been persisted so deleting
// the dataset has no effect on them. The editor is responsible for
// filtering before passing `attachedItems` in.

'use client';

import { useState } from 'react';
import type { FullBankRow } from '@/lib/bank/list-view';

type DeletePath = 'detach' | 'delete_all';

interface Props {
  trendId:              string;
  trendTitle:           string;
  attachedItems:        FullBankRow[];   // pre-filtered to persisted items
  pending:              boolean;
  onClose:              () => void;
  onDeleteEmpty:        () => void;      // zero-attached path
  onDetachAndDelete:    () => void;      // detach + delete dataset
  onDeleteEverything:   () => void;      // delete attached + dataset
}

const CONFIRM_TEXT = 'DELETE';

function stemPreview(stem: string, max = 80): string {
  const s = stem.trim().replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export function DeleteDialog({
  trendId,
  trendTitle,
  attachedItems,
  pending,
  onClose,
  onDeleteEmpty,
  onDetachAndDelete,
  onDeleteEverything,
}: Props) {
  const hasChildren = attachedItems.length > 0;
  const [confirmText, setConfirmText] = useState('');
  const [path, setPath] = useState<DeletePath | null>(
    // With children, require an explicit choice before enabling the
    // confirm button. Without children, there's only one path so we
    // set it up-front to keep the enable/disable logic uniform.
    hasChildren ? null : 'delete_all',
  );

  const typedOk       = confirmText === CONFIRM_TEXT;
  const pathChosen    = hasChildren ? path !== null : true;
  const confirmEnable = typedOk && pathChosen && !pending;

  function onConfirm() {
    if (!confirmEnable) return;
    if (!hasChildren) {
      onDeleteEmpty();
      return;
    }
    if (path === 'detach') onDetachAndDelete();
    else if (path === 'delete_all') onDeleteEverything();
  }

  // Confirm-button label mirrors the chosen path so the curator
  // sees the effect they're about to trigger on the button itself.
  const confirmLabel = (() => {
    if (!hasChildren)          return 'Delete dataset';
    if (path === 'detach')     return 'Detach and delete dataset';
    if (path === 'delete_all') return 'Delete everything';
    return 'Confirm';
  })();

  return (
    <div
      className="tr-delete-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
      onClick={(e) => {
        // Click on the backdrop only (not the dialog shell) closes.
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="tr-delete-dialog">
        <div className="tr-delete-dialog__head">
          <h3>Delete &ldquo;{trendTitle}&rdquo;?</h3>
          <button
            type="button"
            className="tr-delete-dialog__close"
            onClick={onClose}
            aria-label="Close"
            disabled={pending}
          >
            ×
          </button>
        </div>

        <div className="tr-delete-dialog__body">
          {!hasChildren ? (
            <>
              <p className="tr-delete-dialog__msg">
                This dataset has no attached questions. Deleting it is
                permanent and cannot be undone.
              </p>
            </>
          ) : (
            <>
              <p className="tr-delete-dialog__msg">
                This dataset has <strong>{attachedItems.length}</strong>{' '}
                attached{' '}
                {attachedItems.length === 1 ? 'question' : 'questions'}.
                Pick how to handle them:
              </p>

              <ul className="tr-delete-dialog__attached">
                {attachedItems.map((item) => (
                  <li key={item.item_id}>
                    <code>{item.item_id}</code>
                    <span className="tr-delete-dialog__attached-type">
                      {item.question_type}
                    </span>
                    <span className="tr-delete-dialog__attached-stem">
                      {stemPreview(item.stem)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="tr-delete-dialog__choices">
                <label
                  className={`tr-delete-dialog__choice ${
                    path === 'detach' ? 'is-active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="delete-path"
                    value="detach"
                    checked={path === 'detach'}
                    onChange={() => setPath('detach')}
                    disabled={pending}
                  />
                  <div>
                    <strong>Detach and delete dataset</strong>
                    <p>
                      Questions survive as standalone items at{' '}
                      <code>/admin/bank</code> with no trend attachment.
                      Dataset is removed.
                    </p>
                  </div>
                </label>

                <label
                  className={`tr-delete-dialog__choice is-danger ${
                    path === 'delete_all' ? 'is-active' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="delete-path"
                    value="delete_all"
                    checked={path === 'delete_all'}
                    onChange={() => setPath('delete_all')}
                    disabled={pending}
                  />
                  <div>
                    <strong>Delete everything</strong>
                    <p>
                      Attached questions are also deleted. Dataset is
                      removed. Cannot be undone.
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}

          <div className="tr-delete-dialog__confirm-field">
            <label htmlFor="tr-delete-confirm">
              Type <code>{CONFIRM_TEXT}</code> to confirm
            </label>
            <input
              id="tr-delete-confirm"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={pending}
              aria-describedby="tr-delete-confirm-hint"
            />
            <span id="tr-delete-confirm-hint" className="tr-delete-dialog__hint">
              Case-sensitive. Dataset ID: <code>{trendId}</code>
            </span>
          </div>
        </div>

        <div className="tr-delete-dialog__actions">
          <button
            type="button"
            className="tr-btn"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="tr-btn danger"
            onClick={onConfirm}
            disabled={!confirmEnable}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
