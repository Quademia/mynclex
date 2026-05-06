// mynclex/app/(app)/student/bank/practice/summary-panel.tsx
//
// Sticky right rail. Renders the live count tile, length controls,
// recap rows, breakdown preview, and Start CTA.
//
// All state arrives via props — this component is pure presentation
// + a count-input sub-handler. The wider business logic (live count
// fetch, Start handler, disabled-reason derivation) lives in the
// parent practice-builder component.

'use client';

import type { ReactNode } from 'react';

interface RecapRow {
  label: string;
  value: ReactNode;
  muted?: boolean;
}

interface SummaryPanelProps {
  /** Live total from nclex_count_eligible_items, or null while pending. */
  total: number | null;
  /** Set true while a count fetch is in flight. */
  loading: boolean;
  count: number;
  setCount: (n: number) => void;
  intent: 'STUDY' | 'EXAM';
  modeLabel: string;
  isCAT: boolean;
  recap: RecapRow[];
  breakdown: ReactNode | null;
  /** True if requested count exceeds available pool — shows "clamped" line. */
  capped: boolean;
  /** Null = enabled. Non-null = disabled with this message. */
  disabledReason: string | null;
  starting: boolean;
  onStart: () => void;
}

export function SummaryPanel({
  total,
  loading,
  count,
  setCount,
  intent,
  modeLabel,
  isCAT,
  recap,
  breakdown,
  capped,
  disabledReason,
  starting,
  onStart,
}: SummaryPanelProps) {
  const presets = [10, 25, 50, 75];
  const safeTotal = total ?? 0;

  const handlePreset = (n: number) => setCount(Math.min(n, safeTotal || n));
  const handleStep = (delta: number) =>
    setCount(Math.max(1, Math.min(safeTotal || count, count + delta)));
  const onInput = (v: string) => {
    const n = Math.max(1, Math.min(safeTotal || 1, Number(v) || 1));
    setCount(n);
  };

  const matchClass =
    total === null ? '' : total === 0 ? ' err' : total < 10 ? ' warn' : '';

  const startLabel = isCAT
    ? 'Start Exam — CAT'
    : intent === 'EXAM'
      ? `Start Exam · ${modeLabel}`
      : `Start Quiz · ${modeLabel}`;

  return (
    <aside className="bk-summary">
      <div className="bk-summary-title">Your quiz</div>

      {/* Live count tile */}
      <div className={'bk-match' + matchClass}>
        <strong>
          {loading ? '…' : (total ?? 0).toLocaleString()}
        </strong>
        questions match your filters
        {capped && <div className="bk-match-cap">Count clamped to available pool.</div>}
      </div>

      {/* Quiz length — hidden in CAT */}
      {!isCAT && (
        <div className="bk-len">
          <div className="bk-len-row">
            <span className="lbl">Quiz length</span>
            <span className="val">{count} Q</span>
          </div>
          <div className="bk-presets">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={count === p ? 'on' : ''}
                onClick={() => handlePreset(p)}
                disabled={p > safeTotal}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="bk-custom">
            <span className="bk-custom-label">Custom</span>
            <div className="bk-stepper">
              <button type="button" onClick={() => handleStep(-5)}>−</button>
              <input
                type="number"
                min={1}
                max={safeTotal || count}
                value={count}
                onChange={(e) => onInput(e.target.value)}
              />
              <span>/{safeTotal}</span>
              <button type="button" onClick={() => handleStep(5)}>+</button>
            </div>
          </div>
        </div>
      )}

      {/* CAT length tile */}
      {isCAT && (
        <div className="bk-cat-len">
          <div className="bk-cat-len-eyebrow">CAT length</div>
          <div className="bk-cat-len-main">75–145 questions</div>
          <div className="bk-cat-len-sub">Terminates when confidence is reached.</div>
        </div>
      )}

      {/* Recap rows */}
      <div className="bk-recap">
        {recap.map((r, i) => (
          <div key={i} className="bk-recap-row">
            <span className="lbl">{r.label}</span>
            <span className={'val' + (r.muted ? ' muted' : '')}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Breakdown preview — hidden in CAT */}
      {!isCAT && breakdown && (
        <div className="bk-breakdown">
          <div className="bk-breakdown-eyebrow">Roughly</div>
          {breakdown}
        </div>
      )}

      {/* Start CTA */}
      <div className="bk-start-wrap">
        <button
          type="button"
          className="bk-start"
          disabled={!!disabledReason || starting}
          onClick={onStart}
        >
          {starting ? 'Starting…' : startLabel}
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
        {disabledReason && <div className="bk-start-msg">{disabledReason}</div>}
        {!disabledReason && intent === 'EXAM' && !isCAT && (
          <div className="bk-start-note">
            Wall-clock timer · single sitting · cannot be resumed.
          </div>
        )}
        {!disabledReason && intent === 'STUDY' && (
          <div className="bk-start-note">
            You can pause and resume. Progress saves automatically.
          </div>
        )}
      </div>
    </aside>
  );
}
