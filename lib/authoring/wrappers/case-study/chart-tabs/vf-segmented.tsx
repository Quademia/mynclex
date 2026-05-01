// mynclex/lib/authoring/wrappers/case-study/chart-tabs/vf-segmented.tsx
//
// Visible-from segmented control: six buttons labelled 1-6 behind a
// small "Q" label. Drives the per-entry `visible_from` value that
// controls when the student sees the entry during the case runner.
//
// Used by both StructuredTabEditor and NarrativeTabEditor — shared
// here so the visual + keyboard behaviour stays identical.
//
// Slice 12c-2: vendored from lib/bank/case-study/vf-segmented.tsx
// unchanged except the `./types` import path now resolves to the
// authoring tree's parent types.ts.

'use client';

import { VF_MAX, VF_MIN } from '../types';

interface Props {
  value:     number;                  // 1..6
  onChange:  (v: number) => void;
  disabled?: boolean;
}

export function VisibleFromSegmented({ value, onChange, disabled }: Props) {
  const options: number[] = [];
  for (let n = VF_MIN; n <= VF_MAX; n++) options.push(n);

  return (
    <div className="cs-vf-seg" role="radiogroup" aria-label="Visible from question position">
      <span className="cs-vf-seg-label">Q</span>
      {options.map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={active ? 'cs-vf-seg-opt active' : 'cs-vf-seg-opt'}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
