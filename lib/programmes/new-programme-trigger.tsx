// mynclex/lib/programmes/new-programme-trigger.tsx
//
// Client wrapper that owns the modal-open state for the create flow.
// Renders the +New programme button and conditionally mounts
// <ProgrammeFormModal mode="create">.
//
// Two visual variants because the button surfaces in two places:
//   - 'header' — top-right of the My Programmes list
//   - 'empty'  — the empty-state CTA when the tutor has zero programmes

'use client';

import { useState } from 'react';
import { ProgrammeFormModal } from './programme-form-modal';

interface NewProgrammeTriggerProps {
  variant?: 'header' | 'empty';
}

export function NewProgrammeTrigger({
  variant = 'header',
}: NewProgrammeTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const buttonClass =
    variant === 'header' ? 'programmes-new-btn' : 'programmes-empty-cta';
  const buttonLabel =
    variant === 'header' ? '+ New programme' : '+ Create your first programme';

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => setIsOpen(true)}
      >
        {buttonLabel}
      </button>
      {isOpen && (
        <ProgrammeFormModal mode="create" onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
