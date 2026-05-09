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
import { formatClock, tierFor, tierIsStricter, type WarningTier } from '@/lib/practice/runner/clock';
import { CJMM_STEPS } from '@/lib/bank/classifications';
import { CaseEntryBanner } from '@/lib/hints/practice/case-entry-banner';
import type {
  BankItemAnswer,
  McqAnswer,
  SataAnswer,
  SelectNAnswer,
} from '@/lib/scoring';
import type { SelectNContent, MatrixContent, ClozeContent, DragDropContent } from '@/lib/bank/types';
import type { MatrixAnswer, HighlightAnswer, ClozeAnswer, DragDropAnswer, BowtieAnswer } from '@/lib/scoring';
import {
  isMcqComplete,
  isSataComplete,
  isSelectNComplete,
  isMatrixComplete,
  isHighlightComplete,
  isClozeComplete,
  isDragDropComplete,
  isBowtieComplete,
} from '@/lib/practice/runner';
import { ErrorToast } from '@/lib/toast/error-toast';
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
    return <Preflight attempt={data.attempt} itemCount={data.items.length} />;
  }
  return <RunnerShell data={data} />;
}


function RunnerShell({ data }: Props) {
  const router = useRouter();
  const [current, setCurrent]   = useState(0);
  const [filter, setFilter]     = useState<GridFilter>('all');
  const [gridOpen, setGridOpen] = useState(true);

  const [pendingAnswers, setPendingAnswers] =
    useState<Map<string, BankItemAnswer>>(new Map());
  const [clientAnswers, setClientAnswers] =
    useState<Map<string, AnswerRow>>(new Map());
  const [clientUnseal, setClientUnseal] =
    useState<Map<string, PerItemUnseal>>(new Map());

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

  // Per-item mode (UL hybrid §16.1.1). Review mode is uniformly review.
  // Live mode flips to review per-item once an answer row exists.
  const itemMode: 'answering' | 'review' =
    data.mode === 'review' || (currentItem && answersByItem.has(currentItem.attempt_item_id))
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

  const onPrev = () => setCurrent((c) => Math.max(0, c - 1));
  const onPick = (idx: number) => setCurrent(idx);
  const onNext = () => setCurrent((c) => Math.min(total - 1, c + 1));

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
      router.refresh();
    });
  };

  // Footer label / handler / disabled — derived from per-item mode.
  const isLastQ     = current >= total - 1;
  const isAnswering = itemMode === 'answering';
  const isFinishCta = isLastQ && itemMode === 'review' && data.mode === 'live';

  let primaryLabel:    string;
  let primaryDisabled: boolean;
  let primaryHint:     string | undefined;
  let onPrimary:       () => void;

  if (isAnswering) {
    const canSubmit = submitGate?.canSubmit ?? false;
    primaryLabel    = 'Submit answer';
    primaryDisabled = !canSubmit || submitting;
    primaryHint     = canSubmit ? undefined : submitGate?.hint;
    onPrimary       = onSubmit;
  } else if (isFinishCta) {
    // Last Q post-submit in live mode → Finish CTA. completeAttemptAction
    // sets status=COMPLETED + final_score, then router.refresh() re-runs
    // page.tsx with the unsealed projection (review mode).
    primaryLabel    = submitting ? 'Finishing…' : 'Finish quiz';
    primaryDisabled = submitting;
    primaryHint     = undefined;
    onPrimary       = onFinish;
  } else {
    primaryLabel    = 'Next →';
    primaryDisabled = isLastQ;
    primaryHint     = isLastQ ? 'You\'re on the last question' : undefined;
    onPrimary       = onNext;
  }

  // Topbar pill (slice 4.5a):
  //   • Live mode → clockProps (live tick — stopwatch / countdown).
  //   • Review mode → final-score string ("Score · NN%") via statusLabel.
  // The two are passed independently so the topbar picks based on which
  // is non-null. statusLabel keeps a placeholder for live so the existing
  // string contract holds; the clockProps takes precedence in render.
  const statusLabel =
    data.mode === 'review' && data.attempt.final_score !== null
      ? `Score · ${formatPercent(data.attempt.final_score)}`
      : 'Untimed';

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
      />
    );
  } else if (answerRowForCurrent && unsealForCurrent) {
    questionAreaInner = (
      <RunnerQuestionArea
        item={currentItem}
        itemMode="review"
        answerRow={answerRowForCurrent}
        unseal={unsealForCurrent}
        topSlot={cjmmTopSlot}
        trendBadge={inTrend}
      />
    );
  } else {
    questionAreaInner = (
      <div className="rn-q-wrap">
        <div className="rn-stem">{currentItem.stem_snapshot}</div>
        <div className="rn-stub">Loading review data…</div>
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
        />
        {questionAreaInner}
      </div>
    );
  } else if (inTrend && trendSnap) {
    questionArea = (
      <div className="rn-split">
        <TrendPanel trendSnap={trendSnap} />
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
            onPick={onPick}
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
        onPrev={onPrev}
        onPrimary={onPrimary}
      />
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

    case 'DRAG_DROP': {
      const content = item.content_snapshot_json as unknown as DragDropContent;
      const a = pending as DragDropAnswer | undefined;
      const ok = isDragDropComplete(a, content);
      const filled = a
        ? content.slots.filter((s) => Boolean(a[s.id])).length
        : 0;
      const total = content.slots.length;
      return {
        canSubmit:   ok,
        submitValue: ok ? (a as BankItemAnswer) : null,
        hint:        ok ? undefined : `${filled} of ${total} slots filled — finish all to submit`,
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
