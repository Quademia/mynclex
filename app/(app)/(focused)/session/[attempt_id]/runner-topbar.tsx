// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-topbar.tsx
//
// Runner topbar (56px). Layout: [Exit] | [Title + meta] [spacer] [Counter] [Timer] [Mark]
//
// 4.1 stubs:
//   • Mark button — visual only, disabled with tooltip; toggle wiring
//     lands in slice 4.7 (mark-for-review).
//   • Timer pill — always renders the "Untimed · elapsed —" placeholder
//     in 4.1 (per-mode timer behaviour lands in 4.5).
//
// Exit just navigates back to /student/bank/practice. Confirm-on-exit
// for EXAM intent is a 4.5 concern.

'use client';

import { useRouter } from 'next/navigation';

interface CaseMeta {
  caseIndex:    number;   // 1-indexed (e.g. 1st of 3 cases)
  caseTotal:    number;
  cjmmStep:     number;   // 1..6 (step index within the case)
  cjmmStepLabel: string;  // e.g. "Analyse cues"
}

interface Props {
  modeLabel:   string;
  current:     number;          // 1-indexed for display
  total:       number;
  marked:      boolean;
  statusLabel: string;          // "Untimed" in live, "Score · 67%" in review
  // Set on case-childs (slice 4.3) so the meta strip surfaces the
  // case-of-N + CJMM step. Standalones leave this undefined.
  caseMeta?:   CaseMeta;
}

export function RunnerTopbar({ modeLabel, current, total, marked, statusLabel, caseMeta }: Props) {
  const router = useRouter();

  return (
    <header className="rn-top">
      <button
        type="button"
        className="rn-top-exit"
        onClick={() => router.push('/student/bank/practice')}
      >
        ← Exit
      </button>

      <div className="rn-top-divider" />

      <div className="rn-top-title">
        <div className="name">Practice session</div>
        <div className="meta">
          <span>{modeLabel}</span>
          <span className="dot" />
          <span>{total} questions</span>
          {caseMeta && (
            <>
              <span className="dot" />
              <span>Case {caseMeta.caseIndex} of {caseMeta.caseTotal}</span>
              <span className="dot" />
              <span>CJMM step {caseMeta.cjmmStep} of 6 · {caseMeta.cjmmStepLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="rn-top-spacer" />

      <div className="rn-counter">
        Q <strong>{current}</strong>
        <span style={{ color: 'var(--text-faint)' }}>/</span>
        <strong>{total}</strong>
      </div>

      <div className="rn-timer untimed" title="Per-mode timers land in slice 4.5">
        {statusLabel}
      </div>

      <button
        type="button"
        className={'rn-mark-btn' + (marked ? ' on' : '')}
        disabled
        title="Mark-for-review · slice 4.7"
      >
        ⚑ {marked ? 'Marked' : 'Mark'}
      </button>
    </header>
  );
}
