// mynclex/lib/programmes/edit-programme-trigger.tsx
//
// Per-card edit affordance. Renders a small pencil-icon button and
// mounts <ProgrammeFormModal mode="edit"> when clicked. Lives next
// to the status pill in each ProgrammeCard.
//
// stopPropagation + preventDefault on the click stop the click from
// reaching the card's overlay <Link>; the button sits at z-index: 2,
// the overlay link at z-index: 1, so DOM-layer-wise the button wins
// anyway, but the explicit guards are belt-and-braces.

'use client';

import { useState } from 'react';
import type { MouseEvent } from 'react';
import { ProgrammeFormModal } from './programme-form-modal';
import type { ProgrammeListRow } from './types';

interface EditProgrammeTriggerProps {
  programme: ProgrammeListRow;
}

export function EditProgrammeTrigger({ programme }: EditProgrammeTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="programme-card-edit-btn"
        aria-label={`Edit ${programme.title}`}
        title="Edit programme"
        onClick={handleClick}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20h4l10-10-4-4L4 16v4z" />
        </svg>
      </button>
      {isOpen && (
        <ProgrammeFormModal
          mode="edit"
          programmeId={programme.programme_id}
          initial={{
            ...programme,
            // ProgrammeListRow's upfront_total_minor is nullable (rare
            // transient case — programme with no upfront plan row); the
            // form treats it as the canonical full-price authoring field,
            // so coalesce to 0 instead of crashing.
            upfront_total_minor: programme.upfront_total_minor ?? 0,
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
