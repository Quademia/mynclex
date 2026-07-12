// mynclex/lib/payments/readiness-pacing.ts
//
// Pure pacing maths for the readiness results report (§11.5, Slice ④'s
// pacing card + the map's "Rushed" filter). Reads the per-question ENGAGED
// time captured by the time engine (attempt-creation §6.3.2) against the
// pack's per-question budget. No server / React deps so it's shared by the
// server loader (readiness-report.ts) and the client cards, and unit-tested
// in isolation.
//
// The number the engine gives us is engaged time, so pacing is honest
// about attention, not wall-clock. "Rushed" and the average are computed
// over ANSWERED questions only — a skipped question's time is real but
// doesn't speak to how fast you *decided*.

export interface PacingStats {
  /** Mean engaged seconds over answered questions that have captured time. */
  avgAnsweredSec: number | null;
  /** Budgeted seconds per question (duration ÷ count); null when untimed. */
  budgetSec: number | null;
  /** Wall-clock seconds left unused at finish (duration − time used); null if unknown. */
  spareSec: number | null;
  /** Questions the student answered (not skipped). */
  answeredCount: number;
  /** Total delivered questions. */
  totalCount: number;
  /** Answered questions completed under the rushed threshold. */
  rushedCount: number;
  /**
   * True when at least one item carries captured time. False = the sitting
   * predates the time engine, so the pacing card shows a graceful fallback.
   */
  hasTime: boolean;
}

/** Budgeted seconds per question — the pack's own exam pace. */
export function perQuestionBudgetSec(durationSec: number | null, count: number): number | null {
  if (durationSec == null || durationSec <= 0 || count <= 0) return null;
  return durationSec / count;
}

// The "rushed" line: answering in well under the budgeted pace signals a
// likely fast-guess. Budget-relative (0.6 × budget) so it adapts to any
// pack; on the standard 100-Q / 3h20m pack (120s budget) that's ~72s,
// matching the design prototype's flat 70s reference.
export function rushedThresholdSec(budgetSec: number | null): number | null {
  if (budgetSec == null) return null;
  return Math.round(0.6 * budgetSec);
}

/** An answered question completed under the rushed threshold. */
export function isRushed(
  timeSpentSec: number | null,
  answered: boolean,
  budgetSec: number | null,
): boolean {
  if (!answered || timeSpentSec == null) return false;
  const t = rushedThresholdSec(budgetSec);
  return t != null && timeSpentSec < t;
}

// Human "1m 48s" / "45s" / "1h 5m" — seconds dropped past the hour, and a
// clean "26m" when there's no remainder (used for "26m to spare").
export function formatSecsWords(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return ss ? `${m}m ${ss}s` : `${m}m`;
  return `${ss}s`;
}

/** Assemble the pacing card's numbers from the report's per-item time. */
export function summarizePacing(
  items: { timeSpentSec: number | null; answered: boolean }[],
  opts: { durationSec: number | null; wallUsedSec: number | null },
): PacingStats {
  const totalCount = items.length;
  const answered = items.filter((it) => it.answered);
  const answeredWithTime = answered.filter((it) => it.timeSpentSec != null);
  const budgetSec = perQuestionBudgetSec(opts.durationSec, totalCount);

  const avgAnsweredSec = answeredWithTime.length
    ? Math.round(answeredWithTime.reduce((s, it) => s + (it.timeSpentSec ?? 0), 0) / answeredWithTime.length)
    : null;

  const spareSec =
    opts.durationSec != null && opts.wallUsedSec != null
      ? Math.max(0, Math.round(opts.durationSec - opts.wallUsedSec))
      : null;

  return {
    avgAnsweredSec,
    budgetSec: budgetSec != null ? Math.round(budgetSec) : null,
    spareSec,
    answeredCount: answered.length,
    totalCount,
    rushedCount: items.filter((it) => isRushed(it.timeSpentSec, it.answered, budgetSec)).length,
    hasTime: items.some((it) => it.timeSpentSec != null),
  };
}
