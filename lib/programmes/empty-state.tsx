// mynclex/lib/programmes/empty-state.tsx
//
// First-login empty state for the My Programmes list. Shows when
// the tutor has zero programmes. CTA wires straight to
// <NewProgrammeTrigger> (slice 9.1b).

import { NewProgrammeTrigger } from './new-programme-trigger';

export function ProgrammesEmpty() {
  return (
    <div className="programmes-empty">
      <h2 className="programmes-empty-title">
        You haven&apos;t created any programmes yet.
      </h2>
      <p className="programmes-empty-sub">
        Programmes organise weeks of curriculum and host live sessions for
        a cohort of students.
      </p>
      <NewProgrammeTrigger variant="empty" />
    </div>
  );
}
