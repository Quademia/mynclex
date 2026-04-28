// mynclex/lib/authoring/hooks/use-dirty-guard.ts
//
// Tracks whether an editor's form has unsaved edits and intercepts
// close attempts (backdrop click, Escape, X, Cancel) so the curator
// is asked to confirm before losing work.
//
// Usage (per editor host):
//
//   const guard = useDirtyGuard({
//     onClose,                                 // raw close handler
//     onSaveAndClose: () => formRef.requestSubmit(),
//   });
//
//   // pass guard.markDirty to the body's <form onInput={…}>
//   // pass guard.requestClose to <ModalFrame onClose={…}>
//   // call guard.clearDirty() in useSaveAction onSuccess before onClose()
//   // render <DiscardConfirm /> when guard.confirming === true
//
// Dirtiness is detected via a form-level onInput handler (caller's
// responsibility) — that catches every controlled and uncontrolled
// field with one line. False positives ("typed and undid") are fine;
// the warning is cheap.

'use client';

import { useState, useCallback } from 'react';

interface UseDirtyGuardOptions {
  /** Closes the editor without saving. */
  onClose: () => void;
  /**
   * Triggers the editor's save flow. Typically programmatically
   * submits the form (e.g. `formEl.requestSubmit()`); the editor's
   * existing useSaveAction onSuccess will then call clearDirty +
   * onClose itself, so the discard panel doesn't have to.
   */
  onSaveAndClose: () => void;
}

export interface DirtyGuard {
  /** True when at least one edit has happened since open or last save. */
  dirty: boolean;
  /** True when the discard-confirm panel should render. */
  confirming: boolean;
  /** Call from the form's onInput — flips dirty=true once. */
  markDirty: () => void;
  /** Call after a successful save to reset dirty. */
  clearDirty: () => void;
  /** Call from ModalFrame's onClose, the X button, Cancel, etc. */
  requestClose: () => void;
  /** Discard-confirm: dismiss the panel and stay editing. */
  keepEditing: () => void;
  /** Discard-confirm: throw away changes and close. */
  discardAndClose: () => void;
  /** Discard-confirm: trigger save; on success the editor closes itself. */
  saveAndClose: () => void;
}

export function useDirtyGuard({
  onClose,
  onSaveAndClose,
}: UseDirtyGuardOptions): DirtyGuard {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const markDirty = useCallback(() => {
    setDirty((prev) => (prev ? prev : true));
  }, []);

  const clearDirty = useCallback(() => {
    setDirty(false);
  }, []);

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirming(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  const keepEditing = useCallback(() => {
    setConfirming(false);
  }, []);

  const discardAndClose = useCallback(() => {
    setDirty(false);
    setConfirming(false);
    onClose();
  }, [onClose]);

  const saveAndClose = useCallback(() => {
    // Hide the panel first so an inline error from the save action
    // becomes visible on the editor underneath. The editor's
    // useSaveAction onSuccess path is responsible for clearDirty +
    // onClose on success — failure leaves the modal open with the
    // error shown.
    setConfirming(false);
    onSaveAndClose();
  }, [onSaveAndClose]);

  return {
    dirty,
    confirming,
    markDirty,
    clearDirty,
    requestClose,
    keepEditing,
    discardAndClose,
    saveAndClose,
  };
}
