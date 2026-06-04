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
import { ProgIcon } from './prog-icon';

interface NewProgrammeTriggerProps {
  // 'header' — top-right of the list · 'empty' — empty-state CTA ·
  // 'card' — the dashed "+ New programme" tile at the end of the grid.
  variant?: 'header' | 'empty' | 'card';
}

export function NewProgrammeTrigger({
  variant = 'header',
}: NewProgrammeTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const buttonClass =
    variant === 'header'
      ? 'programmes-new-btn'
      : variant === 'card'
        ? 'programmes-newcard'
        : 'programmes-empty-cta';
  const label =
    variant === 'empty' ? 'Create your first programme' : 'New programme';

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => setIsOpen(true)}
      >
        <ProgIcon name="plus" size={variant === 'card' ? 20 : 15} /> {label}
      </button>
      {isOpen && (
        <ProgrammeFormModal mode="create" onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
