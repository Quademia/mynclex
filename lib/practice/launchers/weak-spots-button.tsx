// mynclex/lib/bank/entry-helpers/weak-spots-button.tsx
//
// Pure presentation. Single gradient button — "Practise my weak
// spots · 25 Q". Click → caller decides what to do (Builder fires
// nclex_create_attempt with a hardcoded weak-spot config and
// navigates to the runner).
//
// v1 heuristic for "weak spots": items the student last got wrong
// (pool=Incorrect only). When real weakness analytics ship in slice
// 7.x, the caller's onTrigger logic gets replaced — the component
// itself doesn't care.

'use client';

interface WeakSpotsButtonProps {
  onTrigger: () => Promise<void> | void;
  /** True while the trigger is in flight. */
  pending?: boolean;
  /** True when there's nothing to practise (e.g. no incorrect items
   *  yet). Shows the button as disabled with an explanatory tooltip. */
  disabled?: boolean;
}

export function WeakSpotsButton({
  onTrigger,
  pending = false,
  disabled = false,
}: WeakSpotsButtonProps) {
  const isDead = disabled || pending;
  return (
    <button
      type="button"
      className={'bk-weak' + (isDead ? ' bk-weak-disabled' : '')}
      onClick={() => { if (!isDead) void onTrigger(); }}
      disabled={isDead}
      title={
        disabled
          ? 'Answer some questions first — we’ll surface the ones you missed.'
          : pending
            ? 'Building your weak-spots quiz…'
            : 'Practise items you got wrong on your last attempt — 25 questions, untimed.'
      }
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
      <span className="bk-weak-label">
        {pending ? 'Building…' : 'Practise my weak spots'}
      </span>
      <span className="bk-weak-meta">· 1-tap, 25 Q</span>
    </button>
  );
}
