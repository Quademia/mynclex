// mynclex/lib/programmes/new-programme-trigger.tsx
//
// Client wrapper that owns the modal-open state for the create flow.
// Renders a single create button for ONE delivery mode and mounts
// <ProgrammeFormModal mode="create" deliveryMode={mode}> when clicked.
//
// The delivery mode is chosen by WHICH button the tutor clicks (not a
// field inside the form) — a permanent, create-time-only decision, so
// it reads as a fork in the road rather than an editable toggle. The
// list renders one button per mode (both on the All tab, one each on
// the mode tabs); the form opens pre-committed to that mode.
//
// Three visual variants for the three surfaces the button appears in:
//   - 'header' — top-right of the My Programmes list (filled, mode-tinted)
//   - 'card'   — the dashed "+ New …" tile at the end of a mode grid
//   - 'empty'  — the empty-state CTA

'use client';

import { useState } from 'react';
import { ProgrammeFormModal } from './programme-form-modal';
import { ProgIcon } from './prog-icon';
import type { DeliveryMode } from './types';

interface NewProgrammeTriggerProps {
  mode: DeliveryMode;
  variant?: 'header' | 'card' | 'empty';
}

export function NewProgrammeTrigger({
  mode,
  variant = 'header',
}: NewProgrammeTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const tutored = mode === 'TUTOR_LED';
  const label = tutored ? 'New tutored programme' : 'New self-paced course';
  const modeClass = tutored ? 'is-tutored' : 'is-selfpaced';

  const buttonClass =
    variant === 'header'
      ? `programmes-new-btn ${modeClass}`
      : variant === 'card'
        ? `programmes-newcard ${modeClass}`
        : `programmes-empty-cta ${modeClass}`;

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
        <ProgrammeFormModal
          mode="create"
          deliveryMode={mode}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
