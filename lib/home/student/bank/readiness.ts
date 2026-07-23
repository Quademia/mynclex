// mynclex/lib/home/student/bank/readiness.ts
//
// Card 8 — the exam-readiness panel. The sharpest honesty surface on
// the dashboard, and the one that changed most from the prototype.
//
// ── What this is NOT ──────────────────────────────────────────
// It is not a predicted pass probability. A real one needs outcome
// data — students who sat the actual NCLEX and passed or failed — and
// we have none. Every word here has to stay on the right side of that
// line, including the gate's copy (see GATE_* below).
//
// ── The four decisions behind it (settled with Sam 2026-07-23) ──
//
// 1. THREE SIGNAL STATES, not two. The prototype marked an unmet
//    signal with the same ○ whether the student had fallen short or
//    had never attempted it — and two of the three signals are
//    SEPARATE PURCHASES. A bank-only student who has answered 2,000
//    questions at 78% would have read "Not yet ready · 1 of 4", marked
//    down for two things she hasn't bought, with no route to the top
//    band that doesn't involve spending more money. So a signal is
//    met / not met / NOT YET ATTEMPTED, and the band is computed over
//    what she has actually done.
//
// 2. THE BAND REUSES THE PACK'S VOCABULARY — Building / Approaching /
//    Ready — rather than inventing a third scale ("Not yet / Likely
//    ready"). Excelling is deliberately left out: a readiness pack
//    earns that with a real score out of 100, and three yes/no signals
//    are not precise enough to claim it.
//
// 3. VOLUME IS THE GATE, NOT A SIGNAL. The other three are RESULTS
//    (how well you did); volume is EVIDENCE (how much we know). Mixing
//    them has a bad case: 1,600 answers at 45% would tick a box and
//    read as progress toward ready. Below the gate the band is
//    withheld entirely — which doubles as the first-week empty state
//    the design handoff left undesigned.
//
// 4. THE GATE'S COPY NEVER PROMISES ODDS. At the threshold we can say
//    there is enough practice behind the picture for it to be
//    reliable. We cannot say we can estimate anyone's chances.

import { scoreToBand } from '@/lib/payments/readiness-band';
import { isUnmeasured, UNMEASURED_SHORT_LABEL } from '@/lib/practice/cat/report-derive';
import type { CatVerdict } from '@/lib/cat';

// ── Thresholds ────────────────────────────────────────────────

/**
 * The accuracy a signal counts as met at.
 *
 * 75 rather than the prototype's invented 65, because 75 is a number
 * we can point at: it is the boundary our readiness packs already call
 * "Ready", documented as the defended pass-associated threshold. Using
 * a lower figure for the same idea would put two different bars in the
 * product for "good enough", and only one of them would be traceable
 * to anything.
 */
export const ACCURACY_READY_PCT = 75;

/**
 * Answers required before the band is shown at all. Sam's figure: the
 * point where there is enough behind the picture for it to mean
 * something. Counts non-CAT bank answers — the same population the
 * accuracy signal is computed over, so the gate and the signal it
 * gates cannot disagree.
 */
export const VOLUME_GATE = 1500;

// ── Shapes ────────────────────────────────────────────────────

export type SignalState = 'met' | 'not_met' | 'not_attempted';
export type SignalKey = 'accuracy' | 'pack' | 'cat';

export type ReadinessSignal = {
  key: SignalKey;
  label: string;
  state: SignalState;
  /** The headline figure — "71%", "Ready", "Above standard". Null when
   *  never attempted; the card shows the invitation instead. */
  value: string | null;
  /** The status line under it. For an unattempted signal this is an
   *  invitation, never a reprimand. */
  note: string;
};

export type ReadinessBandKey = 'BUILDING' | 'APPROACHING' | 'READY';

export type ReadinessBandInfo = {
  key: ReadinessBandKey;
  label: string;
  /** Signals met, out of those ATTEMPTED — never out of three. */
  met: number;
  attempted: number;
  /** 1-3, for the three-step meter. */
  step: number;
};

export type ReadinessPanel = {
  gate: {
    answered: number;
    needed: number;
    open: boolean;
    /** Progress toward the gate, 0-100. */
    percent: number;
    remaining: number;
  };
  signals: ReadinessSignal[];
  /** Null while the gate is shut — withheld, not computed. */
  band: ReadinessBandInfo | null;
};

export type ReadinessInputs = {
  /** Whole-history non-CAT accuracy, 0-100. Null if nothing answered. */
  accuracyPct: number | null;
  /** Answers behind that figure — also what the gate counts. */
  answered: number;
  /** Latest COMPLETED readiness pack score, 0-1. Null = never sat one. */
  latestPackScore: number | null;
  /** Latest CAT verdict. Null = never sat one. */
  latestCatVerdict: CatVerdict | null;
  latestCatTerminationReason: string | null;
  latestCatItems: number | null;
};

// ── Copy that must not drift ──────────────────────────────────

export const GATE_HEADLINE = 'Keep practising to unlock your readiness picture';
/** Says what the threshold buys — reliability — and not what it doesn't. */
export const GATE_BODY =
  'Once you have answered enough questions, there is enough practice behind this picture for it to be reliable. It is a read on your work so far, not a prediction of your exam result.';

const BAND_LABEL: Record<ReadinessBandKey, string> = {
  BUILDING: 'Building',
  APPROACHING: 'Approaching',
  READY: 'Ready',
};

// ── Signals ───────────────────────────────────────────────────

function accuracySignal(pct: number | null): ReadinessSignal {
  if (pct === null) {
    return {
      key: 'accuracy',
      label: 'Overall accuracy',
      state: 'not_attempted',
      value: null,
      note: 'Answer some questions to start',
    };
  }
  const met = pct >= ACCURACY_READY_PCT;
  return {
    key: 'accuracy',
    label: 'Overall accuracy',
    state: met ? 'met' : 'not_met',
    value: `${pct}%`,
    note: met ? `At or above ${ACCURACY_READY_PCT}%` : `${ACCURACY_READY_PCT}% is the mark`,
  };
}

function packSignal(score: number | null): ReadinessSignal {
  // Never sat one — an invitation, not a failure. This is the change
  // that stops the panel penalising a student for what she hasn't
  // bought.
  if (score === null) {
    return {
      key: 'pack',
      label: 'Latest readiness pack',
      state: 'not_attempted',
      value: null,
      note: 'Sit a pack to add this signal',
    };
  }
  const band = scoreToBand(score);
  // Ready (75+) and Excelling clear the bar; the pack's own scale
  // decides, so this can never disagree with the pack's own report.
  const met = band?.key === 'READY' || band?.key === 'EXCELLING';
  return {
    key: 'pack',
    label: 'Latest readiness pack',
    state: met ? 'met' : 'not_met',
    // The BAND WORD, never "Passed" — our packs have no pass/fail.
    value: band?.label ?? null,
    note: met ? 'At Ready or better' : 'Ready is the mark',
  };
}

function catSignal(
  verdict: CatVerdict | null,
  reason: string | null,
  items: number | null,
): ReadinessSignal {
  if (verdict === null) {
    return {
      key: 'cat',
      label: 'Last CAT',
      state: 'not_attempted',
      value: null,
      note: 'Sit a CAT to add this signal',
    };
  }
  // A CAT that ran out of time under the item minimum is a fail whose
  // measurement we decline — it does not clear the bar, and the note
  // says why rather than implying the student fell short on ability.
  if (isUnmeasured(reason, items ?? 0)) {
    return {
      key: 'cat',
      label: 'Last CAT',
      state: 'not_met',
      value: 'Not measured',
      note: UNMEASURED_SHORT_LABEL,
    };
  }
  const met = verdict === 'ABOVE_STANDARD';
  return {
    key: 'cat',
    label: 'Last CAT',
    state: met ? 'met' : 'not_met',
    // Binary — there is no "At standard".
    value: met ? 'Above standard' : 'Below standard',
    note: met ? 'Cleared the standard' : 'Below the standard',
  };
}

// ── The band ──────────────────────────────────────────────────

function deriveBand(signals: ReadinessSignal[]): ReadinessBandInfo {
  const attempted = signals.filter((s) => s.state !== 'not_attempted');
  const met = attempted.filter((s) => s.state === 'met').length;

  // Ready needs corroboration. Clearing the accuracy bar alone — with
  // no pack and no CAT behind it — is a real achievement but a thin
  // basis for telling someone they are ready for the exam, so a single
  // attempted signal caps at Approaching and the panel invites the
  // others.
  const key: ReadinessBandKey =
    met === attempted.length && attempted.length >= 2
      ? 'READY'
      : met > 0
        ? 'APPROACHING'
        : 'BUILDING';

  return {
    key,
    label: BAND_LABEL[key],
    met,
    attempted: attempted.length,
    step: key === 'READY' ? 3 : key === 'APPROACHING' ? 2 : 1,
  };
}

export function readinessPanel(input: ReadinessInputs): ReadinessPanel {
  const signals = [
    accuracySignal(input.accuracyPct),
    packSignal(input.latestPackScore),
    catSignal(
      input.latestCatVerdict,
      input.latestCatTerminationReason,
      input.latestCatItems,
    ),
  ];

  const open = input.answered >= VOLUME_GATE;

  return {
    gate: {
      answered: input.answered,
      needed: VOLUME_GATE,
      open,
      percent: Math.min(100, Math.round((input.answered / VOLUME_GATE) * 100)),
      remaining: Math.max(0, VOLUME_GATE - input.answered),
    },
    signals,
    band: open ? deriveBand(signals) : null,
  };
}
