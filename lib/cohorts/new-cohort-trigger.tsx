// mynclex/lib/cohorts/new-cohort-trigger.tsx
//
// Client wrapper that owns the modal-open state for the create
// flow. Renders a + New cohort button and mounts <CohortFormModal>
// on click. Three visual variants because the button surfaces in
// three places:
//
//   - 'header'  — Cohorts tab header
//   - 'card'    — inline on the programme card when cohort_count===0
//   - 'empty'   — empty-state CTA on the cohorts list or overview

'use client';

import { useState } from 'react';
import type { MouseEvent } from 'react';
import { CohortFormModal } from './cohort-form-modal';

interface NewCohortTriggerProps {
  programmeId: string;
  programmeLengthUnits: number;
  variant?: 'header' | 'card' | 'empty';
  /** Visible label override. Defaults vary by variant. */
  label?: string;
}

export function NewCohortTrigger({
  programmeId,
  programmeLengthUnits,
  variant = 'header',
  label,
}: NewCohortTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // The card variant lives inside the programme-card overlay-link
  // pattern, so the click needs to stop bubbling to the parent
  // <Link>. Header + empty variants are standalone — the guards
  // are no-ops there but kept uniform so a future caller using
  // the trigger inside another link can't trip on it.
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(true);
  }

  const buttonClass =
    variant === 'header'
      ? 'cohorts-new-btn'
      : variant === 'card'
        ? 'programme-card-add-cohort'
        : 'cohorts-empty-cta';
  const buttonLabel =
    label ??
    (variant === 'header'
      ? '+ New cohort'
      : variant === 'card'
        ? '+ Add first cohort'
        : '+ Add your first cohort');

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={handleClick}
        aria-label={buttonLabel}
      >
        {buttonLabel}
      </button>
      {isOpen && (
        <CohortFormModal
          programmeId={programmeId}
          programmeLengthUnits={programmeLengthUnits}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
