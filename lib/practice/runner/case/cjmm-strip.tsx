// mynclex/lib/practice/runner/case/cjmm-strip.tsx
//
// Six-step horizontal stepper for case-childs. Highlights the current
// CJMM step and marks earlier ones as done. Designed for the question
// column inside the .rn-split layout, but renders as a self-contained
// pill row — works in any container.

import { Fragment } from 'react';
import { CJMM_STEPS, type CjmmStep } from '@/lib/bank/classifications';

// Short labels — the full names ("Generate solutions", "Evaluate outcomes")
// don't fit the 6-pill row at column widths under ~600px. Order mirrors
// CJMM_STEPS so the index lookup stays trivial.
const SHORT_LABELS: readonly string[] = [
  'Recognise',
  'Analyse',
  'Prioritise',
  'Generate',
  'Take action',
  'Evaluate',
];

interface Props {
  current: CjmmStep | null;
}

export function CjmmStrip({ current }: Props) {
  // null guard — if the case-child somehow has no cjmm_step (shouldn't
  // happen given the NOT NULL CHECK on the link table), fall back to
  // step 1 so the strip doesn't render empty/broken.
  const currentIndex = current ? CJMM_STEPS.indexOf(current) : -1;

  return (
    <div className="rn-cjmm-strip" aria-label="Clinical Judgment Measurement steps">
      {CJMM_STEPS.map((step, i) => {
        const cls =
          i < currentIndex ? 'rn-cjmm-step done' :
          i === currentIndex ? 'rn-cjmm-step current' :
          'rn-cjmm-step';
        return (
          <Fragment key={step}>
            <div className={cls} title={step}>
              <span className="num">{i + 1}</span>
              {SHORT_LABELS[i]}
            </div>
            {i < CJMM_STEPS.length - 1 && (
              <span className="rn-cjmm-arrow" aria-hidden="true">▶</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
