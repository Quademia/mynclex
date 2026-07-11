// mynclex/app/(app)/(focused)/session/[attempt_id]/runner.tsx
//
// Top-level runner client component. Composes the four chrome blocks
// (topbar, footer, grid, question area), owns the local view state
// (current Q, grid filter, grid open), and — as of 4.1.4 — the answer
// state for the live-mode submit/next loop:
//
//   • pendingAnswers — pre-submit picks per item; persists if the
//                      student navigates away and back.
//   • clientAnswers  — answers the student submitted in this session;
//                      merged on top of data.answers (server snapshot).
//   • clientUnseal   — per-Q unseal envelopes (correct + rationale +
//                      marks_max) returned by submitAnswerAction. Live
//                      mode receives these one item at a time per
//                      runner.html §2.3.1; review mode reads the
//                      same fields off the unsealed item directly.
//
// Mode policy reminder (BUILD_LIST.md slice 4.1): every mode renders as
// Untimed Learning behaviour for now — per-Q submit + immediate
// rationale + free nav. Per-mode deltas (timer, sequential lock,
// batched submit) layer in with slice 4.5.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  RunnerData,
  AnswerRow,
  SealedItem,
  UnsealedItem,
  SubmitAnswerResult,
} from '@/lib/practice/runner';
import type { GridFilter } from '@/lib/practice/runner';
import { CasePanel, CjmmStrip, TrendPanel } from '@/lib/practice/runner';
import { getAttemptImageUrlAction } from '@/lib/practice/runner/attempt-image-actions';
import { formatClock, tierFor, tierIsStricter, type WarningTier } from '@/lib/practice/runner/clock';
import { CJMM_STEPS } from '@/lib/bank/classifications';
import { CaseEntryBanner } from '@/lib/hints/practice/case-entry-banner';
import type {
  BankItemAnswer,
  McqAnswer,
  SataAnswer,
  SelectNAnswer,
} from '@/lib/scoring';
import type { SelectNContent, MatrixContent, MatrixMrContent, ClozeContent, DragClozeContent, DragOrderContent } from '@/lib/bank/types';
import type { MatrixAnswer, MatrixMrAnswer, HighlightAnswer, ClozeAnswer, DragClozeAnswer, DragOrderAnswer, BowtieAnswer } from '@/lib/scoring';
import {
  isMcqComplete,
  isSataComplete,
  isSelectNComplete,
  isMatrixComplete,
  isMatrixMrComplete,
  isHighlightComplete,
  isClozeComplete,
  isDragClozeComplete,
  isDragOrderComplete,
  isBowtieComplete,
} from '@/lib/practice/runner';
import { ErrorToast } from '@/lib/toast/error-toast';
import { FinishWithBlanksConfirm } from '@/lib/overlays/practice/finish-with-blanks-confirm';
import { CaseExitConfirm } from '@/lib/overlays/practice/case-exit-confirm';
import { ExitAttemptConfirm } from '@/lib/overlays/practice/exit-attempt-confirm';
import { ReadinessExitConfirm } from '@/lib/overlays/practice/readiness-exit-confirm';
import { ResultsPopup } from '@/lib/practice/runner/results-popup';
import { RunnerTopbar }       from './runner-topbar';
import { RunnerFooter }       from './runner-footer';
import { RunnerGrid, RunnerGridHandle, type CaseGroup } from './runner-grid';
import { RunnerQuestionArea, type PerItemUnseal } from './runner-question-area';
import { Preflight }          from './preflight';
import { submitAnswerAction, completeAttemptAction, saveProgressAction, expireAttemptAction } from './actions';

interface Props {
  data: RunnerData;
}

const MODE_LABELS: Record<RunnerData['attempt']['mode'], string> = {
  UNTIMED_LEARNING:  'Untimed Learning',
  UNTIMED_TEST:      'Untimed Test',
  TIMED_FREE_NAV:    'Timed · free nav',
  TIMED_SEQUENTIAL:  'Timed · sequential',
  CAT:               'CAT',
};

// Archetype collapses 8 (mode, intent) tuples into 3 behavioural groups
// (slice 4.5b — runner.html §15 + BUILD_LIST 4.5):
//
//   • UL            — per-Q submit + immediate rationale + free nav (4.1).
//   • FREE_BATCHED  — per-Q submit removed; footer is Prev / Next / Finish;
//                     rationale hidden mid-quiz; revisable until Finish.
//   • SEQUENTIAL    — per-Q "Submit & continue"; Prev disabled; no Skip.
//                     In 4.5b the lock semantics (DRAFT → SUBMITTED on
//                     submit, cell read-only) are deferred to 4.5c — for
//                     now "Submit & continue" advances + saves like Next.
//
// CAT is treated as Sequential for the dispatch — it isn't reachable in
// v1 (create-attempt rejects CAT mode until slice 3.x), and Sequential is
// the closest defensive default.
type Archetype = 'UL' | 'FREE_BATCHED' | 'SEQUENTIAL';

function getArchetype(mode: RunnerData['attempt']['mode']): Archetype {
  switch (mode) {
    case 'UNTIMED_LEARNING': return 'UL';
    case 'UNTIMED_TEST':
    case 'TIMED_FREE_NAV':   return 'FREE_BATCHED';
    case 'TIMED_SEQUENTIAL':
    case 'CAT':              return 'SEQUENTIAL';
  }
}

function statusMessage(mode: RunnerData['mode'], attemptMode: RunnerData['attempt']['mode']): string {
  if (mode === 'review') {
    return 'Review · use the grid to filter Wrong / Marked / Unanswered, or step in order';
  }
  // 4.5 will branch on attemptMode for timer / sequential / batched-submit copy.
  void attemptMode;
  return 'Untimed Learning · pick an option, Submit to see the rationale, then Next →';
}


// Outer router: preflight gate vs runner shell. Split out so the
// shell's hooks (useState / useMemo) aren't tripped by an early return
// before they're declared (rules-of-hooks).
export function Runner({ data }: Props) {
  if (data.mode === 'live' && data.attempt.started_at === null) {
    return (
      <Preflight
        attempt={data.attempt}
        itemCount={data.items.length}
        exitHref={data.exitHref}
      />
    );
  }
  return <RunnerShell data={data} />;
}


function RunnerShell({ data }: Props) {
  const router = useRouter();
  // Resume to the first item that isn't yet finalised — picks up
  // where the student left off (slice 4.6b). DRAFT rows (Free-batched
  // mid-quiz, or any archetype's pending in-flight answer) are landing
  // targets; SUBMITTED / AUTO_SUBMITTED / SKIPPED are skipped past.
  // Critical for Sequential: the SUBMITTED prefix sits behind disabled
  // Prev, so landing on Q1 when Q1-N are already submitted leaves the
  // student stuck (RPC blocks resubmit, no Skip, no Prev). Universal
  // because the jump is also a UX improvement for UL + Free-batched
  // resume. If every item is finalised (rare — completeAttemptAction
  // would normally have fired), land on the last one to surface Finish.
  const [current, setCurrent]   = useState<number>(() => {
    const finalised = new Set<string>();
    for (const a of data.answers) {
      if (a.submission_status !== 'DRAFT') finalised.add(a.attempt_item_id);
    }
    for (let i = 0; i < data.items.length; i++) {
      if (!finalised.has(data.items[i].attempt_item_id)) return i;
    }
    return Math.max(0, data.items.length - 1);
  });
  const [filter, setFilter]     = useState<GridFilter>('all');
  const [gridOpen, setGridOpen] = useState(true);

  // pendingAnswers seeds from any DRAFT rows already on the server. With
  // universal save-on-tap (slice 4.5a §9.1), every material answer change
  // writes a DRAFT row immediately. On page reload — including
  // mid-attempt EXAM re-entry per attempt-creation §6.1.3 — the runner
  // restores those DRAFTs into pendingAnswers so the student picks up
  // where they left off. Submission rows (SUBMITTED / AUTO_SUBMITTED /
  // SKIPPED) are NOT seeded here — they live in answersByItem and drive
  // per-item review mode for UL.
  const [pendingAnswers, setPendingAnswers] = useState<Map<string, BankItemAnswer>>(
    () => {
      const m = new Map<string, BankItemAnswer>();
      for (const a of data.answers) {
        if (a.submission_status === 'DRAFT' && a.answer_json !== null) {
          m.set(a.attempt_item_id, a.answer_json);
        }
      }
      return m;
    },
  );
  const [clientAnswers, setClientAnswers] =
    useState<Map<string, AnswerRow>>(new Map());
  // Seeds from data.seededUnseal in live mode so resume restores per-Q
  // feedback for items the student already submitted in a prior session
  // (slice 4.6a fix). Empty initial map in review mode — review reads
  // unseal data straight off UnsealedItem.
  const [clientUnseal, setClientUnseal] = useState<Map<string, PerItemUnseal>>(
    () => {
      if (data.mode !== 'live') return new Map();
      return new Map(Object.entries(data.seededUnseal));
    },
  );

  // Finish-with-blanks confirmation modal (Free-batched only).
  const [showBlanksConfirm, setShowBlanksConfirm] = useState(false);

  // Slice 3a — results popup. Auto-shown when the attempt completes in
  // THIS session (set true right before router.refresh() in the four
  // completion paths); stays false when an already-completed attempt
  // is loaded from a URL (so reopening review doesn't auto-pop).
  // Re-openable from the topbar pill after dismiss.
  const [showResults, setShowResults] = useState(false);

  // Slice 3a — exit-attempt confirmation. Only fires in live mode (the
  // attempt is mid-flight and the student might think they're losing
  // work). Review-mode Exit skips the modal and navigates immediately.
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Case-exit warning state (slice 4.5c). When set, the modal is rendered
  // and the click-target is held until the student confirms (Leave anyway)
  // or cancels (Stay in case). Per-attempt suppression flag lets the
  // student dismiss for the rest of the quiz; resets at next attempt.
  const [caseExitTarget, setCaseExitTarget] = useState<number | null>(null);
  const [caseExitSuppressed, setCaseExitSuppressed] = useState(false);

  const [error, setError]   = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  // ── Live clock state (slice 4.5a) ─────────────────────────────────
  // `nowMs` ticks every second while the attempt is live with a started_at
  // anchor. Drives both stopwatch (untimed) and countdown (timed) display.
  // Skipped entirely in review mode — the topbar shows a final-score pill
  // there instead. Per attempt-creation §11, started_at is the timer
  // anchor (set on preflight Start, server-side, invariant for the
  // attempt). Untimed attempts still have started_at set; duration_seconds
  // is what flips us between stopwatch and countdown.
  const startedAtMs = data.attempt.started_at
    ? Date.parse(data.attempt.started_at)
    : null;
  const durationSec = data.attempt.duration_seconds; // null = untimed
  const isTimed     = durationSec !== null;
  const isLive      = data.mode === 'live';

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isLive)              return;
    if (startedAtMs === null) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive, startedAtMs]);

  // Stopwatch / countdown derivations (purely from nowMs + anchors).
  const elapsedSec   = startedAtMs !== null ? (nowMs - startedAtMs) / 1000 : 0;
  const remainingSec = isTimed && durationSec !== null
    ? Math.max(0, durationSec - elapsedSec)
    : null;

  // Warning tier with sticky escalation (§8.4 — tone never reverts).
  // `currentTier` is a pure function of (remaining, duration); the ref
  // remembers the strictest tier ever fired so the UI doesn't relax tone
  // back to neutral if a tick is briefly off.
  const currentTier  = tierFor(remainingSec, durationSec);
  const maxTierRef   = useRef<WarningTier | null>(null);
  if (tierIsStricter(currentTier, maxTierRef.current)) {
    maxTierRef.current = currentTier;
  }
  const effectiveTier = maxTierRef.current;

  // Hide toggle (per-attempt scope — resets at next attempt; locks once
  // any warning fires).
  const [clockHidden, setClockHidden] = useState(false);
  const canHideClock      = effectiveTier === null;
  const effectiveHidden   = clockHidden && canHideClock;
  const onToggleClockHide = () => {
    if (!canHideClock) return;
    setClockHidden((h) => !h);
  };

  // Auto-expire when the countdown hits zero. Single-shot via
  // `firedExpire` so a second tick at zero doesn't double-call. Server
  // RPC is idempotent anyway, but skipping the call keeps the network
  // chatter honest.
  const [firedExpire, setFiredExpire] = useState(false);
  useEffect(() => {
    if (!isLive)             return;
    if (!isTimed)            return;
    if (firedExpire)         return;
    if (remainingSec === null || remainingSec > 0) return;

    setFiredExpire(true);
    startSubmit(async () => {
      const r = await expireAttemptAction(data.attempt.attempt_id);
      if (!r.ok) { setError(r.error); return; }
      setShowResults(true);
      router.refresh();
    });
  }, [isLive, isTimed, remainingSec, firedExpire, data.attempt.attempt_id, router]);

  // Server answers + client overlays. Client wins on conflict — student
  // just submitted in this session, so their fresh row is authoritative.
  const answersByItem = useMemo(() => {
    const m = new Map<string, AnswerRow>();
    for (const a of data.answers)        m.set(a.attempt_item_id, a);
    for (const [k, v] of clientAnswers)  m.set(k, v);
    return m;
  }, [data.answers, clientAnswers]);

  // Mark-for-review wires up in slice 4.7 — empty Set keeps the channel
  // available without changing the chrome contract.
  const marked = useMemo(() => new Set<string>(), []);

  const total       = data.items.length;
  const currentItem = data.items[current];
  const modeLabel   = MODE_LABELS[data.attempt.mode];
  const modeMsg     = statusMessage(data.mode, data.attempt.mode);

  const archetype = getArchetype(data.attempt.mode);

  // Per-item mode (slice 4.5b — corrects the DRAFT bug from 4.5a):
  //   • Whole-attempt review (`data.mode === 'review'`) always wins.
  //   • Otherwise per-item 'review' fires only for UL when the row is
  //     non-DRAFT — i.e. SUBMITTED / AUTO_SUBMITTED / SKIPPED. Free-
  //     batched + Sequential never go to per-item review (rationale is
  //     end-of-quiz — see runner.html §15).
  //   • DRAFT rows from save-on-tap (universal across all archetypes)
  //     keep the student in 'answering' mode so they can keep editing.
  const currentRow = currentItem
    ? answersByItem.get(currentItem.attempt_item_id)
    : undefined;
  const isFinalisedRow = currentRow !== undefined && currentRow.submission_status !== 'DRAFT';
  const itemMode: 'answering' | 'review' =
    data.mode === 'review' || (archetype === 'UL' && isFinalisedRow)
      ? 'review'
      : 'answering';

  // ── Case-block context (slice 4.3) ────────────────────────────────
  // Computed every render from the items array + answer state. The
  // runner has no separate "case state" — case-ness is derived purely
  // from the current item's parent_case_id.
  const currentCaseId = currentItem?.parent_case_id ?? null;
  const caseSnap = useMemo(
    () => (currentCaseId ? data.cases.find((c) => c.case_id === currentCaseId) : undefined),
    [currentCaseId, data.cases],
  );

  // Distinct case_ids in attempt-order — drives the topbar's "Case N of M".
  const caseOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const it of data.items) {
      if (it.parent_case_id && !seen.has(it.parent_case_id)) {
        seen.add(it.parent_case_id);
        order.push(it.parent_case_id);
      }
    }
    return order;
  }, [data.items]);

  // Contiguous case-runs as 0-indexed ranges — drives the grid's case
  // bands. The create-attempt RPC inserts a case's 6 children with
  // consecutive positions, so each run is one contiguous block. A
  // single attempt can carry multiple cases.
  const caseGroups = useMemo<CaseGroup[]>(() => {
    const groups: CaseGroup[] = [];
    let run: CaseGroup | null = null;
    data.items.forEach((it, i) => {
      const cid = it.parent_case_id;
      if (cid && run?.caseId === cid) {
        run.to = i;
      } else {
        if (run) groups.push(run);
        run = cid ? { caseId: cid, from: i, to: i } : null;
      }
    });
    if (run) groups.push(run);
    return groups;
  }, [data.items]);

  // Children of the current case (their attempt_item_ids), and how
  // many have an answer row — drives the panel's "X of N answered" pill.
  const caseChildIds = useMemo(() => {
    if (!currentCaseId) return [] as string[];
    return data.items
      .filter((it) => it.parent_case_id === currentCaseId)
      .map((it) => it.attempt_item_id);
  }, [data.items, currentCaseId]);
  const answeredInCase = caseChildIds.reduce(
    (n, id) => n + (answersByItem.has(id) ? 1 : 0),
    0,
  );

  const cjmmStep      = currentItem?.cjmm_step ?? null;
  const cjmmStepIndex = cjmmStep ? CJMM_STEPS.indexOf(cjmmStep) + 1 : 0;

  // Case-entry banner: fires when the student crosses into a case
  // (null → caseId, or caseA → caseB). Persists 4s then auto-dismiss.
  // Re-entry via grid re-fires the banner per slice 4.3 decision —
  // the rule is "always, every case entry," not "first-time only."
  const prevCaseIdRef = useRef<string | null>(null);
  const [bannerCaseId, setBannerCaseId] = useState<string | null>(null);
  useEffect(() => {
    if (currentCaseId !== null && currentCaseId !== prevCaseIdRef.current) {
      setBannerCaseId(currentCaseId);
    }
    prevCaseIdRef.current = currentCaseId;
  }, [currentCaseId]);

  // ── Trend context (slice 4.4) ─────────────────────────────────────
  // Trends are scattered standalones — no clustering, no progression,
  // no entry banner. Resolved purely from the current item's trend_id.
  // The same dataset re-displays each time the student lands on a
  // trend question that uses it (per attempt-creation §8.3).
  const currentTrendId = currentItem?.trend_id ?? null;
  const trendSnap = useMemo(
    () => (currentTrendId ? data.trends.find((t) => t.trend_id === currentTrendId) : undefined),
    [currentTrendId, data.trends],
  );

  // Resolve the unseal data for the current item. In review mode the
  // unsealed columns sit on the item itself; in live mode we look up
  // the per-Q envelope returned by submitAnswerAction.
  const unsealForCurrent: PerItemUnseal | undefined = useMemo(() => {
    if (!currentItem) return undefined;
    if ('correct_answer_snapshot_json' in currentItem) {
      return {
        correct:      currentItem.correct_answer_snapshot_json,
        rationale:    currentItem.rationale_snapshot,
        rationaleImg: currentItem.rationale_img_snapshot,
        marksMax:     currentItem.marks_snapshot,
      };
    }
    return clientUnseal.get(currentItem.attempt_item_id);
  }, [currentItem, clientUnseal]);

  const pendingForCurrent = currentItem
    ? pendingAnswers.get(currentItem.attempt_item_id)
    : undefined;
  const answerRowForCurrent = currentItem
    ? answersByItem.get(currentItem.attempt_item_id)
    : undefined;

  // Review hardening: an item that reached review with NO answer row — a
  // question never visited in an attempt finished BEFORE the completion
  // fix stamped SKIPPED rows, or any stray gap — still renders. We
  // synthesize a SKIPPED row so it flows down the exact same review path
  // a real skipped answer does (correct answer + rationale + "skipped"),
  // instead of a dead "Loading review data…" stub. Review mode only;
  // answering mode owns the legitimately-empty case.
  const reviewAnswerRow: AnswerRow | undefined =
    itemMode === 'review' && currentItem
      ? answerRowForCurrent ?? {
          attempt_item_id:   currentItem.attempt_item_id,
          answer_json:       null,
          submission_status: 'SKIPPED',
          is_correct:        false,
          score_awarded:     0,
          time_spent_sec:    null,
          submitted_at:      null,
        }
      : answerRowForCurrent;

  const onPrev = () => setCurrent((c) => Math.max(0, c - 1));
  const onPick = (idx: number) => setCurrent(idx);
  const onNext = () => setCurrent((c) => Math.min(total - 1, c + 1));

  // Case-exit warning gate (slice 4.5c). Returns true when a navigation
  // attempt should be intercepted with the warning modal. Only fires for
  // FREE_BATCHED archetype — UL has per-Q rationale rhythm, Sequential
  // already locks Prev + grid. Suppressed for the remainder of the
  // attempt once the student ticks the per-attempt "don't show again"
  // checkbox.
  const shouldWarnCaseExit = (targetIdx: number): boolean => {
    if (archetype !== 'FREE_BATCHED') return false;
    if (caseExitSuppressed)           return false;
    if (data.mode !== 'live')         return false;
    if (!currentItem)                 return false;
    if (!currentCaseId)               return false; // not currently in a case

    const target = data.items[targetIdx];
    if (!target) return false;

    // Staying within the same case → no warning. Includes navigating
    // backward inside the case (e.g. case-child 4 → case-child 2).
    if (target.parent_case_id === currentCaseId) return false;

    // Warn only when the case isn't fully answered. If every child has
    // an answer (DRAFT in pendingAnswers OR finalised in answersByItem),
    // leaving is fine — the student has done the case.
    const allAnswered = caseChildIds.every(
      (id) => pendingAnswers.has(id) || answersByItem.has(id),
    );
    return !allAnswered;
  };

  // Sequential lock (slice 4.5c). Grid clicks are no-ops in Sequential
  // live mode — Prev is already disabled, and the only way forward is
  // Submit & continue (which gates on canSubmit). The grid becomes a
  // pure progress indicator. Free-batched / UL keep grid clicks live;
  // Free-batched additionally checks the case-exit warning gate.
  const onPickGuarded = (idx: number) => {
    if (archetype === 'SEQUENTIAL' && data.mode === 'live') return;
    if (shouldWarnCaseExit(idx)) {
      setCaseExitTarget(idx);
      return;
    }
    onPick(idx);
  };

  const onPrevGuarded = () => {
    const target = current - 1;
    if (target < 0) return;
    if (shouldWarnCaseExit(target)) {
      setCaseExitTarget(target);
      return;
    }
    onPrev();
  };

  const onNextGuarded = () => {
    const target = current + 1;
    if (target >= total) return;
    if (shouldWarnCaseExit(target)) {
      setCaseExitTarget(target);
      return;
    }
    onNext();
  };

  // Save-on-tap (slice 4.5a). Per-item debounce so navigating between
  // questions mid-debounce doesn't drop the pending save for the
  // question we're leaving — each item has its own timer in the map.
  const saveDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Cancel all pending debounces on unmount. Pending RPC calls (already
  // dispatched) continue to completion server-side; only un-fired
  // setTimeouts get cancelled. Documented as best-effort: navigating
  // away mid-debounce may lose ≤500ms of state. STUDY Resume in 4.6
  // reads from server DRAFT rows, so it picks up wherever the last
  // committed save landed.
  useEffect(() => {
    const map = saveDebounceRef.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const onAnswerChange = useCallback(
    (next: BankItemAnswer) => {
      if (!currentItem) return;
      setPendingAnswers((prev) => {
        const m = new Map(prev);
        m.set(currentItem.attempt_item_id, next);
        return m;
      });

      // Skip save-on-tap when:
      //   - attempt is in review mode (status terminal — save_progress
      //     would RAISE because status != IN_PROGRESS), or
      //   - this item already has a finalised row (the per-item itemMode
      //     is review post-submit in UL; save_progress would RAISE on
      //     SUBMITTED row). The RPC enforces both rules; the client skip
      //     avoids the round-trip + console noise.
      if (data.mode === 'review') return;
      if (answersByItem.has(currentItem.attempt_item_id)) return;

      const itemId = currentItem.attempt_item_id;
      const map = saveDebounceRef.current;
      const existing = map.get(itemId);
      if (existing) clearTimeout(existing);

      const t = setTimeout(() => {
        map.delete(itemId);
        // Best-effort save — the server's no-op-on-identical check + the
        // RPC's structural answer compare make duplicate fires harmless.
        // Errors are non-fatal: the next material change saves the latest
        // state, and the eventual Submit RPC would surface a hard error
        // path. Log to console for visibility during dev.
        saveProgressAction(itemId, next).then((r) => {
          if (!r.ok) console.warn('saveProgressAction failed:', r.error);
        });
      }, 500);

      map.set(itemId, t);
    },
    [currentItem, data.mode, answersByItem],
  );

  // Per-type submit gate — `canSubmit` controls the button, `submitValue`
  // is the actual answer to send (SATA coerces undefined → []), and `hint`
  // is the footer copy when disabled. See getSubmitGate at the bottom.
  const submitGate = currentItem
    ? getSubmitGate(currentItem, pendingForCurrent)
    : null;

  const onSubmit = () => {
    if (!currentItem || !submitGate?.canSubmit || submitGate.submitValue === null) return;
    const submission = submitGate.submitValue;
    startSubmit(async () => {
      const r = await submitAnswerAction(currentItem.attempt_item_id, submission);
      if (!r.ok) { setError(r.error); return; }
      mergeSubmitResult(r.data, submission, setClientAnswers, setClientUnseal);
    });
  };

  const onFinish = () => {
    startSubmit(async () => {
      const r = await completeAttemptAction(data.attempt.attempt_id);
      if (!r.ok) { setError(r.error); return; }
      // The page re-fetches in review mode (status flipped to COMPLETED);
      // the unsealed projection now flows in for every item, no client
      // overlays needed for the items the student didn't submit in this
      // session.
      setShowBlanksConfirm(false);
      setShowResults(true);
      router.refresh();
    });
  };

  // Free-batched Finish: gate on unanswered count. With at least one
  // unanswered question, surface the confirmation modal; from there the
  // student can either go back (Cancel) or commit (Finish anyway → onFinish).
  // UL never reaches this — its Finish CTA only appears post-submit on the
  // last Q, which means all rows are SUBMITTED. Sequential's Finish path
  // is "Submit & finish" — also no blanks possible because each Q gets
  // submitted as the student advances (or will, once 4.5c locks the row).
  const unansweredCount = useMemo(() => {
    let n = 0;
    for (const it of data.items) {
      const has = pendingAnswers.has(it.attempt_item_id) || answersByItem.has(it.attempt_item_id);
      if (!has) n++;
    }
    return n;
  }, [data.items, pendingAnswers, answersByItem]);

  const onFinishFreeBatched = () => {
    if (unansweredCount > 0) {
      setShowBlanksConfirm(true);
      return;
    }
    onFinish();
  };

  // Sequential per-Q submit + advance (slice 4.5c). The button's gate
  // already enforces canSubmit (slice 4.5b "no Skip" rule). On success,
  // the row flips DRAFT → SUBMITTED via the existing submit RPC, then
  // setCurrent advances. The grid cell becomes locked on the next
  // render because answersByItem now sees the SUBMITTED row, and
  // onPickGuarded blocks all grid clicks for Sequential anyway.
  const onSubmitAndAdvance = () => {
    if (!currentItem || !submitGate?.canSubmit || submitGate.submitValue === null) return;
    const submission = submitGate.submitValue;
    startSubmit(async () => {
      const r = await submitAnswerAction(currentItem.attempt_item_id, submission);
      if (!r.ok) { setError(r.error); return; }
      mergeSubmitResult(r.data, submission, setClientAnswers, setClientUnseal);
      setCurrent((c) => Math.min(total - 1, c + 1));
    });
  };

  // Sequential last-Q "Submit & finish" — submit the last DRAFT then
  // finalise. completeAttemptAction's _flushDrafts is a no-op for this
  // attempt by then (every prior Q was already submitted via
  // onSubmitAndAdvance), so it just flips status + computes final_score.
  const onSubmitAndFinish = () => {
    if (!currentItem || !submitGate?.canSubmit || submitGate.submitValue === null) return;
    const submission = submitGate.submitValue;
    startSubmit(async () => {
      const r = await submitAnswerAction(currentItem.attempt_item_id, submission);
      if (!r.ok) { setError(r.error); return; }
      mergeSubmitResult(r.data, submission, setClientAnswers, setClientUnseal);

      const r2 = await completeAttemptAction(data.attempt.attempt_id);
      if (!r2.ok) { setError(r2.error); return; }
      setShowResults(true);
      router.refresh();
    });
  };

  // Footer label / handler / disabled — archetype-aware (slice 4.5b).
  const isLastQ     = current >= total - 1;
  const isAnswering = itemMode === 'answering';
  const isFinishCta = isLastQ && itemMode === 'review' && data.mode === 'live';

  let primaryLabel:    string;
  let primaryDisabled: boolean;
  let primaryHint:     string | undefined;
  let onPrimary:       () => void;

  if (data.mode === 'review' || !isLive) {
    // Review state — primary is unused (no footer interaction needed).
    // Keep a Next-style label so the rendered button shape is preserved.
    primaryLabel    = 'Next →';
    primaryDisabled = isLastQ;
    primaryHint     = isLastQ ? 'You\'re on the last question' : undefined;
    onPrimary       = onNext;

  } else if (archetype === 'UL') {
    // UL behaviour (4.1 — unchanged): per-Q Submit → review → Next/Finish.
    // onNextGuarded is no-op for UL (case-exit guard only fires for
    // FREE_BATCHED), so behaviour is identical to direct onNext.
    if (isAnswering) {
      const canSubmit = submitGate?.canSubmit ?? false;
      primaryLabel    = 'Submit answer';
      primaryDisabled = !canSubmit || submitting;
      primaryHint     = canSubmit ? undefined : submitGate?.hint;
      onPrimary       = onSubmit;
    } else if (isFinishCta) {
      primaryLabel    = submitting ? 'Finishing…' : 'Finish quiz';
      primaryDisabled = submitting;
      primaryHint     = undefined;
      onPrimary       = onFinish;
    } else {
      primaryLabel    = 'Next →';
      primaryDisabled = isLastQ;
      primaryHint     = isLastQ ? 'You\'re on the last question' : undefined;
      onPrimary       = onNextGuarded;
    }

  } else if (archetype === 'FREE_BATCHED') {
    // Free-batched (UT, TFN both intents): no per-Q Submit. Footer is just
    // Next ›, plus Finish quiz on the last Q. Save-on-tap (4.5a) persists
    // every change as a DRAFT row server-side; no per-Q rationale fires
    // until the whole attempt finalises (data.mode === 'review').
    // onNextGuarded surfaces the case-exit warning when the student
    // tries to leave a partly-answered case via Next (slice 4.5c).
    if (isLastQ) {
      primaryLabel    = submitting ? 'Finishing…' : 'Finish quiz';
      primaryDisabled = submitting;
      primaryHint     = undefined;
      onPrimary       = onFinishFreeBatched;
    } else {
      primaryLabel    = 'Next →';
      primaryDisabled = false;
      primaryHint     = undefined;
      onPrimary       = onNextGuarded;
    }

  } else {
    // Sequential (TS both intents). 4.5c lock semantics now live:
    //   • Submit & continue calls submitAnswerAction (DRAFT → SUBMITTED)
    //     then advances. The grid cell becomes locked on the next render
    //     because answersByItem reflects the SUBMITTED row.
    //   • Submit & finish does the same submit + completeAttemptAction.
    //   • Prev is disabled (RunnerFooter via prevDisabled prop).
    //   • Grid clicks are no-op live (onPickGuarded short-circuits).
    //
    // "No Skip button (must commit)" rule from BUILD_LIST 4.5b: Sequential
    // gates the primary button on submitGate.canSubmit so the student
    // can't advance / finish without answering the current question.
    // Matches NCLEX authenticity — you can't skip on the real exam, you
    // pick something even if you're guessing. Timer expiry remains the
    // other way out: AUTO_SUBMITs whatever DRAFT exists + SKIPs the rest
    // via expireAttemptAction.
    const canSubmit = submitGate?.canSubmit ?? false;
    const skipHint  = 'Pick an answer to continue — no skipping in Sequential mode';
    if (isLastQ) {
      primaryLabel    = submitting ? 'Finishing…' : 'Submit & finish';
      primaryDisabled = !canSubmit || submitting;
      primaryHint     = canSubmit ? undefined : (submitGate?.hint ?? skipHint);
      onPrimary       = onSubmitAndFinish;
    } else {
      primaryLabel    = 'Submit & continue →';
      primaryDisabled = !canSubmit || submitting;
      primaryHint     = canSubmit ? undefined : (submitGate?.hint ?? skipHint);
      onPrimary       = onSubmitAndAdvance;
    }
  }

  // Topbar pill (slice 4.5a):
  //   • Live mode → clockProps (live tick — stopwatch / countdown).
  //   • Review mode → final-score string ("Score · NN%") via statusLabel.
  // The two are passed independently so the topbar picks based on which
  // is non-null. statusLabel keeps a placeholder for live so the existing
  // string contract holds; the clockProps takes precedence in render.
  //
  // Tutor-Quiz slice 3: if the attempt has a pass_score (graded
  // attempt — set today only by `nclex_create_programme_attempt`
  // from the quiz's pass_score), append "· Pass" / "· Fail" based
  // on `final_score >= pass_score`. Ungraded attempts (pass_score
  // null) show only the score, unchanged.
  let statusLabel: string;
  if (data.mode === 'review' && data.attempt.final_score !== null) {
    const scorePart = `Score · ${formatPercent(data.attempt.final_score)}`;
    if (data.attempt.pass_score !== null) {
      const passed = data.attempt.final_score >= data.attempt.pass_score;
      statusLabel = `${scorePart} · ${passed ? 'Pass' : 'Fail'}`;
    } else {
      statusLabel = scorePart;
    }
  } else {
    statusLabel = 'Untimed';
  }

  const clockProps = (!isLive || startedAtMs === null)
    ? null
    : {
        mode:    isTimed ? ('countdown' as const) : ('stopwatch' as const),
        display: isTimed
          ? formatClock(remainingSec ?? 0)
          : formatClock(elapsedSec),
        tier:         effectiveTier,
        hidden:       effectiveHidden,
        canHide:      canHideClock,
        onToggleHide: onToggleClockHide,
      };

  // Branch the RunnerQuestionArea props at the call site so the child
  // gets clean discriminated-union props (review carries answerRow +
  // unseal, both required) — no defensive fallback inside per-type
  // runners. The "review-but-unseal-missing" branch is currently
  // unreachable in 4.1; surfaces only with slice 4.6 (Resume) where
  // server-stored answer rows arrive without client-side unseal data.
  //
  // Case-block layout (slice 4.3): when the current item has a
  // parent_case_id and we have a matching CaseSnapshot, wrap the
  // question area in a .rn-split grid with the CasePanel on the left
  // and a CJMM strip in the question column's topSlot. The split's
  // right column IS the .rn-q-wrap (clamped by minmax(520, 720) on
  // the grid column), so the question's internal layout is unchanged.
  const inCase  = Boolean(currentCaseId  && caseSnap);
  const inTrend = Boolean(currentTrendId && trendSnap);
  const cjmmTopSlot = inCase && cjmmStep
    ? <CjmmStrip current={cjmmStep} />
    : undefined;

  let questionAreaInner: React.ReactNode;
  if (!currentItem) {
    questionAreaInner = (
      <div className="rn-q-wrap">
        <div className="rn-stub">No questions in this attempt.</div>
      </div>
    );
  } else if (itemMode === 'answering') {
    questionAreaInner = (
      <RunnerQuestionArea
        item={currentItem}
        itemMode="answering"
        pendingAnswer={pendingForCurrent}
        onAnswerChange={onAnswerChange}
        topSlot={cjmmTopSlot}
        trendBadge={inTrend}
        resolveImageUrl={(id) =>
          getAttemptImageUrlAction(data.attempt.attempt_id, id)
        }
      />
    );
  } else if (reviewAnswerRow && unsealForCurrent) {
    questionAreaInner = (
      <RunnerQuestionArea
        item={currentItem}
        itemMode="review"
        answerRow={reviewAnswerRow}
        unseal={unsealForCurrent}
        topSlot={cjmmTopSlot}
        trendBadge={inTrend}
        resolveImageUrl={(id) =>
          getAttemptImageUrlAction(data.attempt.attempt_id, id)
        }
      />
    );
  } else {
    // Near-unreachable now: review synthesizes a skipped row (above) and
    // the unsealed columns always load in review. Kept as an honest
    // fallback — no longer a mislabeled "Loading…" that never resolves.
    questionAreaInner = (
      <div className="rn-q-wrap">
        <div className="rn-stem">{currentItem.stem_snapshot}</div>
        <div className="rn-stub">Review details aren’t available for this question.</div>
      </div>
    );
  }

  // Wrap in .rn-split when on a case-child OR a trend question. Cases
  // win if both fire (defensive — case-childs are not authored as trend
  // questions in v1, but the schema allows the columns to coexist).
  // The CasePanel's React key is the case_id so its internal tab state
  // persists across siblings of the same case (and resets when the
  // student crosses into a different case). The TrendPanel needs no
  // key because it carries no internal state.
  let questionArea: React.ReactNode;
  if (inCase && caseSnap) {
    questionArea = (
      <div className="rn-split">
        <CasePanel
          key={caseSnap.case_id}
          caseSnap={caseSnap}
          currentPosition={currentItem?.case_position ?? 1}
          totalChildren={caseChildIds.length}
          answeredCount={answeredInCase}
          resolveImageUrl={(id) =>
            getAttemptImageUrlAction(data.attempt.attempt_id, id)
          }
        />
        {questionAreaInner}
      </div>
    );
  } else if (inTrend && trendSnap) {
    questionArea = (
      <div className="rn-split">
        <TrendPanel
          trendSnap={trendSnap}
          resolveImageUrl={(id) =>
            getAttemptImageUrlAction(data.attempt.attempt_id, id)
          }
        />
        {questionAreaInner}
      </div>
    );
  } else {
    questionArea = questionAreaInner;
  }

  // Topbar case meta — only shown on case-childs.
  const caseMeta = inCase && currentCaseId
    ? {
        caseIndex:     caseOrder.indexOf(currentCaseId) + 1,
        caseTotal:     caseOrder.length,
        cjmmStep:      cjmmStepIndex,
        cjmmStepLabel: cjmmStep ?? '',
      }
    : undefined;

  return (
    <div className="rn">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      <RunnerTopbar
        modeLabel={modeLabel}
        current={current + 1}
        total={total}
        marked={marked.has(currentItem?.attempt_item_id ?? '')}
        statusLabel={statusLabel}
        caseMeta={caseMeta}
        clock={clockProps}
        onExit={
          // Live (mid-flight) → confirm first. Review → leave directly.
          data.mode === 'live'
            ? () => setShowExitConfirm(true)
            : () => router.push(data.exitHref)
        }
        onPillClick={
          data.mode === 'review' && data.attempt.final_score !== null
            ? () => setShowResults(true)
            : null
        }
      />

      <div className="rn-body">
        <main className="rn-main">
          <div className="rn-main-scroll">
            {bannerCaseId && bannerCaseId === currentCaseId && (
              <CaseEntryBanner
                key={bannerCaseId}
                totalChildren={caseChildIds.length}
                onDismiss={() => setBannerCaseId(null)}
              />
            )}
            {questionArea}
          </div>
        </main>

        {gridOpen ? (
          <RunnerGrid
            items={data.items}
            answers={answersByItem}
            marked={marked}
            current={current}
            filter={filter}
            caseGroups={caseGroups}
            revealCorrectness={data.mode === 'review' || archetype === 'UL'}
            onPick={onPickGuarded}
            onFilterChange={setFilter}
            onCollapse={() => setGridOpen(false)}
          />
        ) : (
          <RunnerGridHandle
            current={current + 1}
            total={total}
            onExpand={() => setGridOpen(true)}
          />
        )}
      </div>

      <RunnerFooter
        current={current + 1}
        total={total}
        modeMsg={modeMsg}
        primaryLabel={primaryLabel}
        primaryDisabled={primaryDisabled}
        primaryHint={primaryHint}
        prevDisabled={archetype === 'SEQUENTIAL' && data.mode === 'live'}
        prevHint={archetype === 'SEQUENTIAL' ? 'Sequential mode — no going back' : undefined}
        onPrev={onPrevGuarded}
        onPrimary={onPrimary}
      />

      {showBlanksConfirm && (
        <FinishWithBlanksConfirm
          unansweredCount={unansweredCount}
          totalCount={total}
          pending={submitting}
          onCancel={() => setShowBlanksConfirm(false)}
          onSubmitAnyway={onFinish}
        />
      )}

      {caseExitTarget !== null && currentCaseId && (
        <CaseExitConfirm
          answeredInCase={answeredInCase}
          totalChildren={caseChildIds.length}
          onCancel={() => setCaseExitTarget(null)}
          onLeaveAnyway={(suppress) => {
            if (suppress) setCaseExitSuppressed(true);
            const target = caseExitTarget;
            setCaseExitTarget(null);
            setCurrent(target);
          }}
        />
      )}

      {showExitConfirm && data.mode === 'live' && (
        data.attempt.source === 'READINESS_PACK' ? (
          // One-shot pack: End & submit (score as-is) vs Leave (resumable) vs
          // Keep going. End reuses the normal finish path — completeAttempt
          // scores unreached questions as zero over the full pack (§2 r2).
          <ReadinessExitConfirm
            pending={submitting}
            onEndSubmit={() => {
              setShowExitConfirm(false);
              onFinish();
            }}
            onLeave={() => {
              setShowExitConfirm(false);
              router.push(data.exitHref);
            }}
            onCancel={() => setShowExitConfirm(false)}
          />
        ) : (
          <ExitAttemptConfirm
            isTimed={isTimed}
            onCancel={() => setShowExitConfirm(false)}
            onConfirm={() => {
              setShowExitConfirm(false);
              router.push(data.exitHref);
            }}
          />
        )
      )}

      {/* Slice 3a — results popup. Renders only in review mode (gated
          to a terminal attempt status) AND when showResults is true.
          Set true in the four completion paths (onFinish,
          onSubmitAndFinish, onFinishFreeBatched via onFinish, auto-
          expire). Reopened via the topbar pill click on dismiss. */}
      {showResults && data.mode === 'review' && (
        <ResultsPopup
          attemptId={data.attempt.attempt_id}
          finalScore={data.attempt.final_score}
          passScore={data.attempt.pass_score}
          totalQ={total}
          source={data.attempt.source}
          onReview={() => {
            setCurrent(0);
            setShowResults(false);
          }}
          onDismiss={() => setShowResults(false)}
        />
      )}
    </div>
  );
}


// Pretty-print a 0..1 final_score as an integer percentage.
function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}


// Per-type submit gate. Each per-type module owns its "is the current
// pending answer enough to submit?" rule (isMcqComplete / isSataComplete
// / isSelectNComplete / etc.). This dispatcher reads the right rule per
// question_type, returning:
//
//   • canSubmit:   boolean — controls the Submit button
//   • submitValue: BankItemAnswer | null — the value to send to
//     submitAnswerAction (null when the gate fails). For SATA, the
//     undefined-pending case is coerced to [] since "zero selections"
//     is a valid answer (per Sam, 2026-05-07).
//   • hint:        string | undefined — footer copy when canSubmit is
//     false. Type-aware (e.g. "Select 3 of 3 to submit" for SELECT_N).
//
// As slice 4.2 wires MATRIX / HIGHLIGHT / CLOZE / DRAG_DROP / BOWTIE,
// each adds a case here that consults its own isXxxComplete helper.
interface SubmitGate {
  canSubmit:   boolean;
  submitValue: BankItemAnswer | null;
  hint:        string | undefined;
}

function getSubmitGate(
  item:    SealedItem | UnsealedItem,
  pending: BankItemAnswer | undefined,
): SubmitGate {
  switch (item.question_type) {
    case 'MCQ':
    case 'TF': {
      const a = pending as McqAnswer | undefined;
      const ok = isMcqComplete(a);
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : 'Pick an option to enable Submit',
      };
    }

    case 'SATA': {
      const a = (pending as SataAnswer | undefined) ?? [];
      // isSataComplete is `() => true` — kept in the call chain so the
      // SATA-allows-zero rule visibly belongs to sata.tsx, not buried
      // here.
      const ok = isSataComplete(a);
      return {
        canSubmit:   ok,
        submitValue: a as BankItemAnswer,
        hint:        undefined,
      };
    }

    case 'SELECT_N': {
      const content = item.content_snapshot_json as unknown as SelectNContent;
      const a = pending as SelectNAnswer | undefined;
      const n = content.select_count;
      const ok = isSelectNComplete(a, n);
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `Select ${n} of ${n} to submit`,
      };
    }

    case 'MATRIX': {
      const content = item.content_snapshot_json as unknown as MatrixContent;
      const a = pending as MatrixAnswer | undefined;
      const ok = isMatrixComplete(a, content);
      const answered = a ? Object.keys(a).filter((k) => a[k]).length : 0;
      const total = content.rows.length;
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `${answered} of ${total} rows answered — finish all to submit`,
      };
    }

    case 'MATRIX_MR': {
      const content = item.content_snapshot_json as unknown as MatrixMrContent;
      const a = pending as MatrixMrAnswer | undefined;
      const ok = isMatrixMrComplete(a, content);
      // Name the rows still missing a pick (Q3 "which rows" cue).
      const unanswered = content.rows
        .map((r, i) => ((a?.[r.id]?.length ?? 0) > 0 ? null : i + 1))
        .filter((n): n is number => n !== null);
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok
          ? undefined
          : `Pick at least one in every row — row${unanswered.length > 1 ? 's' : ''} ${unanswered.join(', ')} still empty`,
      };
    }

    case 'HIGHLIGHT': {
      // Like SATA: zero highlights is a deliberate "nothing relevant"
      // answer. isHighlightComplete is `() => true` — kept in the call
      // chain so the rule visibly belongs to highlight.tsx.
      const a = (pending as HighlightAnswer | undefined) ?? [];
      const ok = isHighlightComplete(a);
      return {
        canSubmit:   ok,
        submitValue: a as BankItemAnswer,
        hint:        undefined,
      };
    }

    case 'CLOZE': {
      const content = item.content_snapshot_json as unknown as ClozeContent;
      const a = pending as ClozeAnswer | undefined;
      const ok = isClozeComplete(a, content);
      const filled = a ? Object.values(a).filter(Boolean).length : 0;
      const total  = content.blanks.length;
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `${filled} of ${total} blanks filled — finish all to submit`,
      };
    }

    case 'DRAG_CLOZE': {
      const content = item.content_snapshot_json as unknown as DragClozeContent;
      const a = pending as DragClozeAnswer | undefined;
      const ok = isDragClozeComplete(a, content);
      const filled = a
        ? content.slots.filter((s) => Boolean(a[s.id])).length
        : 0;
      const total = content.slots.length;
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `${filled} of ${total} blanks filled — finish all to submit`,
      };
    }

    case 'DRAG_ORDER': {
      const content = item.content_snapshot_json as unknown as DragOrderContent;
      const a = pending as DragOrderAnswer | undefined;
      const ok = isDragOrderComplete(a, content);
      const filled = a
        ? content.slots.filter((s) => Boolean(a[s.id])).length
        : 0;
      const total = content.slots.length;
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `${filled} of ${total} positions filled — finish all to submit`,
      };
    }

    case 'BOWTIE': {
      // Empty-default before first interaction so isBowtieComplete sees
      // a well-shaped object regardless of whether the student has
      // started.
      const a = (pending as BowtieAnswer | undefined) ?? {
        left: [], centre: null, right: [],
      };
      const ok = isBowtieComplete(a);
      const total = a.left.length + (a.centre ? 1 : 0) + a.right.length;
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `${total} of 5 picks made — each wing needs 2 + 1 + 2`,
      };
    }
  }

  // Exhaustiveness — adding a 10th QuestionType makes item.question_type
  // not be `never` here and breaks the build until the new type is
  // handled in the switch.
  const _exhaustive: never = item.question_type;
  return _exhaustive;
}


// Folds a SubmitAnswerResult + the picked answer into the two client
// state maps. Pulled out as a free function for clarity.
function mergeSubmitResult(
  result:        SubmitAnswerResult,
  pickedAnswer:  BankItemAnswer,
  setClientAns:  React.Dispatch<React.SetStateAction<Map<string, AnswerRow>>>,
  setClientUns:  React.Dispatch<React.SetStateAction<Map<string, PerItemUnseal>>>,
) {
  const answer: AnswerRow = {
    attempt_item_id:   result.attempt_item_id,
    answer_json:       pickedAnswer,
    submission_status: 'SUBMITTED',
    is_correct:        result.is_correct,
    score_awarded:     result.score_awarded,
    time_spent_sec:    null,
    submitted_at:      new Date().toISOString(),
  };
  setClientAns((prev) => {
    const m = new Map(prev);
    m.set(result.attempt_item_id, answer);
    return m;
  });
  setClientUns((prev) => {
    const m = new Map(prev);
    m.set(result.attempt_item_id, {
      correct:      result.correct_answer_snapshot_json,
      rationale:    result.rationale_snapshot,
      rationaleImg: result.rationale_img_snapshot,
      marksMax:     result.marks_max,
    });
    return m;
  });
}
