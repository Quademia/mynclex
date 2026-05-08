// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-footer.tsx
//
// Runner footer (64px). Layout: [Prev] [Status msg] [Submit / Next / Finish]
//
// In 4.1.2b the right-side primary is a disabled "Submit answer" with a
// "MCQ wiring lands in 4.1.4" hint. 4.1.4 swaps it to an enabled
// Submit (pre-submit) → Next (post-submit) → Finish (last Q post-submit).

'use client';

interface Props {
  current:    number;     // 1-indexed
  total:      number;
  modeMsg:    string;     // mode-aware status message
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryHint?: string;
  onPrev: () => void;
  onPrimary?: () => void;
}

export function RunnerFooter({
  current,
  total,
  modeMsg,
  primaryLabel    = 'Submit answer',
  primaryDisabled = true,
  primaryHint     = 'MCQ wiring lands in slice 4.1.4',
  onPrev,
  onPrimary,
}: Props) {
  const atFirst = current <= 1;
  const atLast  = current >= total;

  return (
    <footer className="rn-foot">
      <div className="rn-foot-side">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onPrev}
          disabled={atFirst}
        >
          ← Previous
        </button>
      </div>

      <div className="rn-foot-msg">{modeMsg}</div>

      <div className="rn-foot-side right">
        <button
          type="button"
          className="btn btn-accent btn-sm"
          disabled={primaryDisabled}
          title={primaryDisabled ? primaryHint : undefined}
          onClick={onPrimary}
        >
          {primaryLabel}{atLast && !primaryDisabled ? '' : ' →'}
        </button>
      </div>
    </footer>
  );
}
