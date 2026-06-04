// mynclex/lib/programmes/empty-state.tsx
//
// First-login empty state for the Programmes list (zero programmes).
// CD uplift: a rounded icon badge + warmer copy + the primary CTA that
// wires straight to <NewProgrammeTrigger variant="empty">.

import { NewProgrammeTrigger } from './new-programme-trigger';
import { ProgIcon } from './prog-icon';

export function ProgrammesEmpty() {
  return (
    <div className="programmes-empty">
      <div className="programmes-empty-icon">
        <ProgIcon name="calendar" size={28} />
      </div>
      <h2 className="programmes-empty-title">Create your first programme</h2>
      <p className="programmes-empty-sub">
        A programme is a curriculum plus the cohorts of students you run it
        with. Set it up once, then add cohorts whenever a new group starts.
      </p>
      <NewProgrammeTrigger variant="empty" />
    </div>
  );
}
