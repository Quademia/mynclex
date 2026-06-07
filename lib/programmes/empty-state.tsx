// mynclex/lib/programmes/empty-state.tsx
//
// Segment-aware empty states for the Programmes list:
//   - 'all'        : brand-new tutor onboarding — both create buttons +
//                    a one-line explanation of the two delivery modes.
//   - 'tutored'    : "Create your first tutored programme" (explains cohorts).
//   - 'selfpaced'  : "Create your first self-paced course."
//
// Each create CTA is a <NewProgrammeTrigger mode=… variant="empty">, so
// the button opens the form pre-committed to that mode (the mode is
// never a field in the form).

import { NewProgrammeTrigger } from './new-programme-trigger';
import { ProgIcon } from './prog-icon';

type Segment = 'all' | 'tutored' | 'selfpaced';

export function ProgrammesEmpty({ segment }: { segment: Segment }) {
  if (segment === 'tutored') {
    return (
      <div className="programmes-empty">
        <div className="programmes-empty-icon">
          <ProgIcon name="users" size={28} />
        </div>
        <h2 className="programmes-empty-title">
          Create your first tutored programme
        </h2>
        <p className="programmes-empty-sub">
          Tutored programmes run in <b>cohorts</b> — intakes of students who
          start together, attend your live sessions, and move through the
          curriculum week by week. Set it up once, then open a cohort whenever a
          new group begins.
        </p>
        <NewProgrammeTrigger mode="TUTOR_LED" variant="empty" />
      </div>
    );
  }

  if (segment === 'selfpaced') {
    return (
      <div className="programmes-empty">
        <div className="programmes-empty-icon">
          <ProgIcon name="zap" size={26} />
        </div>
        <h2 className="programmes-empty-title">
          Create your first self-paced course
        </h2>
        <p className="programmes-empty-sub">
          Self-paced courses have <b>no cohorts</b>. Students enrol directly and
          move through the modules at their own pace — an evergreen offering
          that runs without scheduled intakes or live sessions.
        </p>
        <NewProgrammeTrigger mode="SELF_PACED" variant="empty" />
      </div>
    );
  }

  // segment === 'all' — onboarding for a brand-new tutor with nothing yet.
  return (
    <div className="programmes-empty is-onboarding">
      <div className="programmes-empty-icon">
        <ProgIcon name="calendar" size={28} />
      </div>
      <h2 className="programmes-empty-title">Build your first programme</h2>
      <p className="programmes-empty-sub">
        Every programme runs in one of two ways — and you choose which when you
        create it. Pick the shape that fits how you teach.
      </p>
      <div className="programmes-onboard-modes">
        <div className="onboard-mode mode-tutored">
          <div className="onboard-mode-icon">
            <ProgIcon name="users" size={20} />
          </div>
          <h3 className="onboard-mode-title">Tutor-led</h3>
          <p className="onboard-mode-desc">
            Runs in scheduled <b>cohorts</b> with shared start dates and live
            sessions. The bootcamp shape.
          </p>
          <NewProgrammeTrigger mode="TUTOR_LED" variant="empty" />
        </div>
        <div className="onboard-mode mode-selfpaced">
          <div className="onboard-mode-icon">
            <ProgIcon name="zap" size={20} />
          </div>
          <h3 className="onboard-mode-title">Self-paced</h3>
          <p className="onboard-mode-desc">
            No cohorts — students enrol directly and learn at their own pace.
            The evergreen course shape.
          </p>
          <NewProgrammeTrigger mode="SELF_PACED" variant="empty" />
        </div>
      </div>
    </div>
  );
}
