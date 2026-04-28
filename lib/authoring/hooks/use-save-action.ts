// mynclex/lib/authoring/hooks/use-save-action.ts
//
// Shared submit-and-handle-result hook used by every editor body.
// Wraps a server action in a useTransition + useState so the editor
// can:
//   - Show a "Saving…" pending state (disable buttons).
//   - Surface validation errors returned by the action.
//   - Call an optional onSuccess hook (close modal, flash, etc.).
//
// Generic over the action's result type. The hook treats any result
// with `{ ok: false, error }` as a validation failure and any other
// shape as success — covers SaveResult and DeleteResult from
// lib/authoring/actions/.

'use client';

import { useState, useTransition } from 'react';

interface ActionResultBase {
  ok?: boolean;
  error?: string;
}

interface UseSaveActionOptions<T> {
  /** Called with the action result on a successful response. */
  onSuccess?: (result: T) => void;
}

export function useSaveAction<T extends ActionResultBase>(
  action: (formData: FormData) => Promise<T>,
  options: UseSaveActionOptions<T> = {},
) {
  const { onSuccess } = options;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result && result.ok === false) {
        setError(result.error ?? 'Unknown error.');
        return;
      }
      onSuccess?.(result);
    });
  }

  function clearError() {
    setError(null);
  }

  return { error, pending, submit, clearError };
}
