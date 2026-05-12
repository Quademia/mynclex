// mynclex/lib/cohorts/edit-cohort-trigger.tsx
//
// Client wrapper that owns the modal-open state for the cohort
// edit flow. Renders an "Edit cohort" button and mounts
// <CohortFormModal mode="edit"> when clicked. Used from the
// cohort Settings tab in slice 9.2c.

'use client';

import { useState } from 'react';
import { CohortFormModal } from './cohort-form-modal';
import type { CohortFormValues } from './types';

interface EditCohortTriggerProps {
  cohortId: string;
  programmeLengthUnits: number;
  initial: CohortFormValues;
}

export function EditCohortTrigger({
  cohortId,
  programmeLengthUnits,
  initial,
}: EditCohortTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="prog-btn prog-btn-ghost"
        onClick={() => setIsOpen(true)}
      >
        Edit cohort
      </button>
      {isOpen && (
        <CohortFormModal
          mode="edit"
          cohortId={cohortId}
          programmeLengthUnits={programmeLengthUnits}
          initial={initial}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
