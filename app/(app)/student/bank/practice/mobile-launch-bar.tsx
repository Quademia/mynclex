// mynclex/app/(app)/student/bank/practice/mobile-launch-bar.tsx
//
// The phone-only launch strip (≤768px), pinned directly above the student
// bottom tab bar. It carries exactly two things — the live count and the
// Start button — because on a phone those two have to do their jobs while
// you are somewhere else on the page:
//
//   · the count is the builder's whole feel (tick a filter, watch the
//     number move), and that is lost the moment the rail stops being
//     beside you;
//   · Start has to be reachable without scrolling back down a form that
//     measures ~2,800px on the Filters tab.
//
// It deliberately does NOT duplicate the summary panel. Stacking the grid
// puts the panel — recap, length controls, breakdown, start note — at the
// end of the form in full, so nothing had to be dropped to fit a bar.
// (The design handoff shed all four to fit one; in flow there is room.)
//
// Rendered on every viewport and hidden above 768px by CSS rather than by
// a JS width check: the open/closed state would otherwise have to be known
// at render time on the server, which it cannot be.

'use client';

import { MIN_ITEMS, MAX_ITEMS } from '@/lib/cat';
import { startLabelFor } from './summary-panel';

interface MobileLaunchBarProps {
  /** Live total, or null while pending / in CAT (where it has no meaning). */
  total: number | null;
  loading: boolean;
  intent: 'STUDY' | 'EXAM';
  modeLabel: string;
  isCAT: boolean;
  /** Null = enabled. Non-null = disabled with this message. */
  disabledReason: string | null;
  starting: boolean;
  onStart: () => void;
}

export function MobileLaunchBar({
  total,
  loading,
  intent,
  modeLabel,
  isCAT,
  disabledReason,
  starting,
  onStart,
}: MobileLaunchBarProps) {
  const matchClass =
    isCAT || total === null ? '' : total === 0 ? ' err' : total < 10 ? ' warn' : '';

  // CAT has no filter count to show — its length is the engine's range.
  // Read from the engine's own constants, never typed in: the hardcoded
  // "75–145" pair is the pre-NGN range §9 corrected to 85–150, and it is
  // still sitting in the design handoff this surface was rebuilt from.
  const figure = isCAT
    ? `${MIN_ITEMS}–${MAX_ITEMS}`
    : loading
      ? '…'
      : (total ?? 0).toLocaleString();
  const figureSub = isCAT ? 'adaptive length' : 'questions match';

  return (
    <div className="bk-launchbar">
      <div className="bk-launchbar-row">
        <div className={'bk-launchbar-count' + matchClass}>
          <strong>{figure}</strong>
          <span>{figureSub}</span>
        </div>
        <button
          type="button"
          className="bk-launchbar-start"
          disabled={!!disabledReason || starting}
          onClick={onStart}
        >
          {starting
            ? 'Starting…'
            : startLabelFor({ isCAT, intent, modeLabel, short: true })}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {disabledReason && (
        <div className="bk-launchbar-msg">{disabledReason}</div>
      )}
    </div>
  );
}
