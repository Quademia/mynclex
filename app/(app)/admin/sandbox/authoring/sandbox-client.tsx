// mynclex/app/(app)/admin/sandbox/authoring/sandbox-client.tsx
//
// Client wrapper around <McqEditor>. Owns the modal open/close state.
// Mounts the editor as the standalone modal host (the same host the
// bank list will use in Slice 2).
//
// The modal is open on mount so loading the page demonstrates the
// editor immediately — closing it returns to the sandbox page
// background, and a button re-opens it.

'use client';

import { useState } from 'react';
import {
  McqEditor,
  type McqEditorInitial,
} from '@/lib/authoring/editors/mcq-editor';

export function SandboxClient({ initial }: { initial: McqEditorInitial }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button
        type="button"
        className="auth-btn auth-btn-primary"
        onClick={() => setOpen(true)}
        disabled={open}
      >
        Open MCQ editor
      </button>

      {open && <McqEditor initial={initial} onClose={() => setOpen(false)} />}
    </>
  );
}
