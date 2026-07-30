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
// Mode policy: the runner dispatches on ARCHETYPE — UL, FREE_BATCHED,
// SEQUENTIAL — defined in lib/practice/runner/mode-brief.ts. (The note that
// stood here saying "every mode renders as Untimed Learning behaviour for
// now ... layer in with slice 4.5" described the pre-4.5 runner and was years
// out of date: the timer, the sequential lock and batched submit all ship.)

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
// Sandbox tutorial scores Submit locally with the SAME pure scorer the
// server action uses — identical feedback, zero network. See onSubmit.
import { scoreAttempt } from '@/lib/scoring';
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
import { Calculator } from '@/lib/calculator/calculator';
import { SandboxCoach } from '@/lib/practice/tutorial/coach/coach';
import { RunnerQuestionArea, type PerItemUnseal } from './runner-question-area';
import { Preflight }          from './preflight';
import { submitAnswerAction, completeAttemptAction, saveProgressAction, expireAttemptAction, recordQuestionTimeAction, recordEngagedTimeAction, toggleBookmarkAction, toggleFlagAction } from './actions';
import { applyBookmarkToggle } from '@/lib/practice/runner/bookmarks';
import { flaggingOffered, flagEditable, initialFlagSet, applyFlagToggle } from '@/lib/practice/runner/flags';
import { useEngagementClock } from './use-engagement-clock';
import { catTurnAction } from '@/lib/practice/cat/turn-action';
import { useQuestionTimer } from './use-question-timer';
import { useTurnTransition } from './use-turn-transition';
import { CatTransition } from './cat-transition';
import { isBlocking } from '@/lib/practice/cat/turn-transition';
import { modeLabelFor } from '@/lib/practice/builder/filter-config';
import { archetypeFor, footerBrief } from '@/lib/practice/runner/mode-brief';

interface Props {
  data: RunnerData;
}

// This file keeps NO copy of its own for modes. Three things it used to
// hardcode now resolve from one place each, because all three had gone stale
// in the same way — they described a runner that no longer exists:
//
//   • the mode LABEL  → modeLabelFor(intent, mode) in the builder's config.
//     The local map was mode-keyed, so it could not express TIMED_FREE_NAV
//     being named differently under each intent, and had drifted to a third
//     spelling of it.
//   • the ARCHETYPE   → archetypeFor(mode) in mode-brief.ts, which sits next
//     to the per-mode copy that has to agree with it. CAT dispatches as
//     SEQUENTIAL; the old note claiming CAT "isn't reachable in v1" predates
//     the engine, which has been live since 2026-07-19 and is on prod.
//   • the FOOTER LINE → footerBrief(...). The local version returned
//     Untimed-Learning copy for EVERY non-CAT mode, promising a rationale
//     after each submit to students in batched and sequential modes who see
//     nothing until the end.


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
        offerDismissed={data.offerDismissed ?? false}
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
  const [navCurrent, setCurrent] = useState<number>(() => {
    const finalised = new Set<string>();
    for (const a of data.answers) {
      if (a.submission_status !== 'DRAFT') finalised.add(a.attempt_item_id);
    }
    for (let i = 0; i < data.items.length; i++) {
      if (!finalised.has(data.items[i].attempt_item_id)) return i;
    }
    return Math.max(0, data.items.length - 1);
  });

  // ── CAT (slice 6b) ────────────────────────────────────────────────
  // A CAT's item list GROWS one row per turn — every other mode knows all
  // its questions up front.
  const isCat = data.attempt.mode === 'CAT';

  // For a LIVE CAT the current index is DERIVED, never stored. During the
  // exam there is no navigation, so "which question am I on" is always "the
  // newest one" — a computed value, not state.
  //
  // Storing it caused a real bug (fixed 2026-07-19): the turn handler
  // advanced the index immediately but the new question only arrives a
  // round-trip later, so for that gap the index pointed past the end of the
  // array, `currentItem` was undefined, and the runner fell through to its
  // "No questions in this attempt." stub — the message meant for a broken
  // attempt, shown mid-exam. Fast on localhost; a second or more on mobile
  // data.
  //
  // Deriving it also delivers §10.1 for free: during the wait the index
  // still points at the LAST item of the old array, so the question the
  // student just answered stays on screen instead of vanishing — exactly
  // the "current question stays visible, dimmed" the spec asks for.
  //
  // Scoped to LIVE CAT deliberately. Every other mode — and a CAT in
  // REVIEW — needs the stored index: they have free navigation, Prev/Next
  // and clickable grid cells. A finished CAT is just a fixed-length attempt
  // with a known item list, so its review navigates like any other; only the
  // live exam (which grows one item per turn and forbids going back) pins to
  // the newest item. Reviewing a CAT with this still `isCat`-only would have
  // frozen the pane on the last question — Prev/Next/grid all inert.
  const current = isCat && data.mode === 'live'
    ? Math.max(0, data.items.length - 1)
    : navCurrent;
  const [filter, setFilter]     = useState<GridFilter>('all');
  const [gridOpen, setGridOpen] = useState(true);
  // The on-screen calculator (BUILD_LIST #16) — a real NCLEX tool, so it is
  // available in every mode; closed by default, toggled from the topbar.
  const [calcOpen, setCalcOpen] = useState(false);

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

  // CAT between-question escalation (slice 6c). Owns the dim → spinner →
  // "Still loading…" → Retry timeline for the turn round-trip. Driven by
  // onCatTurn: begin() on submit, fail() on error, reset() when the next
  // question lands. Inert for every other mode.
  const turnTx = useTurnTransition();

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
  // Runner tutorial sandbox (docs/product-plan/runner-tutorial.md). The
  // no-writes teaching runner: same shell, same components, but every
  // server action is skipped and Submit scores locally against
  // data.sandboxKeys. Gated so real attempts are byte-for-byte unchanged.
  const isSandbox   = data.mode === 'live' && data.sandbox === true;

  // ── Exam-mode display leaks (bank-consumption-cat.html §16.6) ──────
  // During a LIVE exam, the runner must not reveal anything that (a) shows
  // the engine's opinion of the candidate — chiefly the difficulty pill,
  // which in a CAT is a live readout of the ability estimate — or (b)
  // pre-announces the exam's structure / internal item scaffolding (case
  // counter, CJMM step). Stripped for ALL exam-intent modes, not just CAT
  // (Sam, 2026-07-25): "an exam is an exam." Also strips the subject chip.
  // Study modes keep the scaffolding (it teaches), and it all comes back in
  // REVIEW — which is why the flag is gated on `isLive`: a completed exam
  // being reviewed is educational, not a live leak.
  const hideExamScaffold = data.attempt.intent === 'EXAM' && isLive;

  // ── Engagement clock (BUILD_LIST #6) ──────────────────────────────
  // (STUDY, TIMED_FREE_NAV) counts ENGAGED time, not wall time: the
  // countdown freezes while the page is hidden and resumes on return,
  // durably across a full close (engaged_seconds_used persists server-side).
  // Every other mode keeps the wall clock below. The hook is a no-op unless
  // enabled, so calling it unconditionally is safe.
  const isEngagementClock =
    data.attempt.intent === 'STUDY' && data.attempt.mode === 'TIMED_FREE_NAV';
  const { engagedSec, persistNow: persistEngaged } = useEngagementClock({
    enabled:         isLive && startedAtMs !== null && isEngagementClock && isTimed,
    priorEngagedSec: data.attempt.engaged_seconds_used ?? 0,
    attemptId:       data.attempt.attempt_id,
    onPersist:       recordEngagedTimeAction,
  });

  // Sandbox: freeze the clock at the start time so server and client render
  // the same value (no hydration mismatch), and because an untimed teaching
  // run shouldn't imply the student is being timed. Init to startedAtMs (a
  // prop, identical on both sides) → elapsed 0 → a steady "0:00".
  const [nowMs, setNowMs] = useState<number>(() =>
    isSandbox && startedAtMs !== null ? startedAtMs : Date.now(),
  );
  useEffect(() => {
    if (!isLive)              return;
    if (isSandbox)            return;   // frozen clock — never tick in the tutorial
    if (startedAtMs === null) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive, isSandbox, startedAtMs]);

  // Stopwatch / countdown derivations. Engagement mode counts down from
  // ENGAGED time (frozen while away); every other timed mode from wall
  // elapsed. Untimed → null (stopwatch).
  const elapsedSec   = startedAtMs !== null ? (nowMs - startedAtMs) / 1000 : 0;
  const usedSec      = isEngagementClock ? engagedSec : elapsedSec;
  const remainingSec = isTimed && durationSec !== null
    ? Math.max(0, durationSec - usedSec)
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

  // ── Per-question time engine (attempt-creation §6.3.2) ────────────
  // Independent of the attempt clock above — this measures ENGAGED time
  // per question (pauses on screen-away), the attempt clock measures
  // wall-clock time left. The two don't sum. Tracks only in live mode
  // with a started clock; review mode passes null → nothing counted.
  // Flushes are fire-and-forget (additive RPC self-heals); flushActive()
  // is awaited by the finish handlers so the last segment lands before
  // the attempt goes terminal.
  const timerEnabled = isLive && startedAtMs !== null && !isSandbox;
  const { flushActive } = useQuestionTimer({
    activeItemId: data.items[current]?.attempt_item_id ?? null,
    enabled:      timerEnabled,
    onFlush:      recordQuestionTimeAction,
  });

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
      await flushActive();  // bank the last per-question segment
      persistEngaged();     // and the engaged total, before status flips
      const r = await expireAttemptAction(data.attempt.attempt_id);
      if (!r.ok) { setError(r.error); return; }
      setShowResults(true);
      router.refresh();
    });
  }, [isLive, isTimed, remainingSec, firedExpire, data.attempt.attempt_id, router, flushActive, persistEngaged]);

  // Engagement clock — save the engaged total on every question change
  // (navigation + submit-and-advance), one of its natural save points.
  // Leaving the page is saved inside the hook; a hard crash mid-question
  // forgives that question's engaged time, in the student's favour
  // (BUILD_LIST #6). No-op for every non-engagement attempt.
  useEffect(() => {
    persistEngaged();
  }, [navCurrent, persistEngaged]);

  // Server answers + client overlays. Client wins on conflict — student
  // just submitted in this session, so their fresh row is authoritative.
  const answersByItem = useMemo(() => {
    const m = new Map<string, AnswerRow>();
    for (const a of data.answers)        m.set(a.attempt_item_id, a);
    for (const [k, v] of clientAnswers)  m.set(k, v);
    return m;
  }, [data.answers, clientAnswers]);

  // Flags (§2) — "come back to this before I submit". Keyed by
  // ATTEMPT_ITEM_ID, so this set belongs to THIS sitting and starts empty
  // every time; a question flagged in an earlier sitting is not flagged
  // here. Seeded straight from the item rows — is_flagged rides along, so
  // there is no second query.
  //
  // ⚠ The opposite of `bookmarkedItemIds` below in every respect. Both are
  // Set<string>; only the names stop them being swapped (§3.8).
  const [flaggedAttemptItemIds, setFlaggedAttemptItemIds] = useState<Set<string>>(
    () => initialFlagSet(data.items),
  );
  const [flagBusy, setFlagBusy] = useState(false);

  // Bookmarks (§3) — "save this question so I can study it again". Seeded
  // from the server with the bookmarks this student ALREADY holds among this
  // sitting's questions (§3.7): a bookmark is (student, question), so one met
  // in an earlier sitting arrives already on. Empty when bookmarking is not
  // offered here (CAT / readiness / tutor quiz).
  const [bookmarkedItemIds, setBookmarkedItemIds] = useState<Set<string>>(
    () => new Set(data.bookmarkedItemIds),
  );
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  const total       = data.items.length;
  // A live CAT hides its total (length unknowable mid-exam → "Adaptive
  // length"); in review the length is final and known, so a CAT review shows
  // "Q N / 85" like any other finished attempt.
  const displayTotal = isCat && data.mode === 'live' ? null : total;
  const currentItem = data.items[current];
  const modeLabel   = modeLabelFor(data.attempt.intent, data.attempt.mode);
  const modeMsg     = footerBrief(data.attempt.intent, data.attempt.mode, data.mode === 'review');
  // Topbar title — the intent frame ("Study session" / "Exam session"),
  // singular to match the mode-label cleanup that dropped "Exams". Applies
  // in review too: a reviewed exam is still an exam session.
  const sessionTitle = data.attempt.intent === 'EXAM' ? 'Exam session' : 'Study session';

  // Bookmark toggle for the question on screen. Optimistic: flip locally,
  // then write. A bookmark is one row with nothing downstream of it, so an
  // optimistic flip that loses costs a revert and a toast — much better than
  // a control that stalls mid-sitting while a clock runs.
  //
  // ⚠ setError is called OUTSIDE the state updater. Calling it inside one and
  // returning the state unchanged makes React bail out of the re-render, so
  // the toast never appears — the exact defect found in the case bank's
  // third-case refusal.
  const currentBookmarkId = currentItem?.item_id ?? null;
  const onToggleBookmark = useCallback(() => {
    if (!currentBookmarkId || isSandbox) return;

    const next = !bookmarkedItemIds.has(currentBookmarkId);
    setBookmarkedItemIds((prev) => applyBookmarkToggle(prev, currentBookmarkId, next));
    setBookmarkBusy(true);

    void toggleBookmarkAction(data.attempt.attempt_id, currentBookmarkId, next)
      .then((r) => {
        if (!r.ok) {
          setBookmarkedItemIds((prev) =>
            applyBookmarkToggle(prev, currentBookmarkId, !next),
          );
          setError(r.error);
        }
      })
      .catch(() => {
        setBookmarkedItemIds((prev) =>
          applyBookmarkToggle(prev, currentBookmarkId, !next),
        );
        setError('Could not save that bookmark. Please try again.');
      })
      .finally(() => setBookmarkBusy(false));
  }, [currentBookmarkId, bookmarkedItemIds, data.attempt.attempt_id, isSandbox]);

  // Flag toggle for the question on screen. Optimistic like the bookmark,
  // and for a stronger reason: this fires mid-sitting with a clock running,
  // so a control that waits on the network before responding is worse than
  // one that occasionally has to revert.
  //
  // ⚠ setError lives OUTSIDE the state updater — see the note on the
  // bookmark handler above.
  const currentFlagId = currentItem?.attempt_item_id ?? null;
  const canEditFlag   = flagEditable(data.attempt, isLive) && !isSandbox;
  const onToggleFlag = useCallback(() => {
    if (!currentFlagId || !canEditFlag) return;

    const next = !flaggedAttemptItemIds.has(currentFlagId);
    setFlaggedAttemptItemIds((prev) => applyFlagToggle(prev, currentFlagId, next));
    setFlagBusy(true);

    void toggleFlagAction(currentFlagId, next)
      .then((r) => {
        if (!r.ok) {
          setFlaggedAttemptItemIds((prev) => applyFlagToggle(prev, currentFlagId, !next));
          setError(r.error);
        }
      })
      .catch(() => {
        setFlaggedAttemptItemIds((prev) => applyFlagToggle(prev, currentFlagId, !next));
        setError('Could not save that flag. Please try again.');
      })
      .finally(() => setFlagBusy(false));
  }, [currentFlagId, canEditFlag, flaggedAttemptItemIds]);

  const archetype = archetypeFor(data.attempt.mode);

  // Question grid availability. In a LIVE Sequential exam or CAT the grid
  // can't navigate — clicks are already a no-op (onPickGuarded), so it was
  // tappable-looking dead furniture. Hide it entirely there; the question
  // reclaims the space (.rn-main is flex:1, the grid a fixed sibling). The
  // SEQUENTIAL archetype covers CAT too (it dispatches as SEQUENTIAL).
  // Gated on isLive so REVIEW keeps the grid — in review you can navigate
  // freely to inspect any answer. Also drives the topbar grid toggle:
  // where there's no grid, there's no toggle.
  const gridAvailable = !(archetype === 'SEQUENTIAL' && isLive);

  // NOTE: `isCat` and the derived `current` are declared with the state
  // block above — `current` is read at the question timer before this point.
  // For CAT, `total` is not a length: it is "how many have been served so
  // far", which is why the topbar/footer/grid take `number | null`.

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
      // Sandbox writes nothing — there is no attempt row to save into.
      if (isSandbox) return;
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
    [currentItem, data.mode, answersByItem, isSandbox],
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

    // Sandbox: score locally against the baked-in key and reveal the same
    // per-Q feedback the server would — no attempt row, no RPC, no write.
    if (isSandbox) {
      const k = data.sandboxKeys?.[currentItem.attempt_item_id];
      if (!k) return;
      const { score_awarded, is_correct } = scoreAttempt(
        currentItem.question_type,
        k.correct,
        submission,
      );
      mergeSubmitResult(
        {
          attempt_item_id:              currentItem.attempt_item_id,
          score_awarded,
          is_correct,
          marks_max:                    k.marksMax,
          correct_answer_snapshot_json: k.correct,
          rationale_snapshot:           k.rationale,
          rationale_img_snapshot:       k.rationaleImg,
        },
        submission,
        setClientAnswers,
        setClientUnseal,
      );
      return;
    }

    startSubmit(async () => {
      const r = await submitAnswerAction(currentItem.attempt_item_id, submission);
      if (!r.ok) { setError(r.error); return; }
      mergeSubmitResult(r.data, submission, setClientAnswers, setClientUnseal);
    });
  };

  const onFinish = () => {
    // Sandbox has no attempt to complete — Finish just leaves the tutorial.
    // (The coach layer in Slice 2 will replace this with a proper ending.)
    if (isSandbox) { router.push(data.exitHref); return; }
    startSubmit(async () => {
      await flushActive(); // bank the last segment before status flips
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

  // CAT turn (slice 6b). One call does everything the other modes split
  // across submitAnswerAction + advance: the server scores the answer,
  // re-estimates ability, decides whether the exam is over, and either
  // snapshots the next question or writes the verdict.
  //
  // On CONTINUE we router.refresh() rather than appending the item
  // client-side. The server loader is what strips answer keys from a live
  // attempt (the "no answer-key leakage" boundary), so building an item in
  // the browser would step around the one place that seal is enforced.
  // Refreshing costs a round-trip and keeps the seal honest.
  const onCatTurn = () => {
    if (!currentItem || !submitGate?.canSubmit || submitGate.submitValue === null) return;
    const submission = submitGate.submitValue;
    // Captured here, so a Retry re-submits with the id of the SAME question —
    // the idempotency guard. currentItem is stable across a failed turn (items
    // only grows on success), so this equals what the student saw.
    const expectedItemId = currentItem.attempt_item_id;

    // Start the escalation timeline. On a fast turn it never gets past the
    // 300ms dim; on a slow or dropped one it climbs to the spinner, message
    // and Retry (slice 6c).
    turnTx.begin();

    startSubmit(async () => {
      await flushActive(); // bank the time segment before the row finalises

      const elapsed = data.attempt.started_at
        ? Math.max(0, Math.floor((Date.now() - Date.parse(data.attempt.started_at)) / 1000))
        : 0;

      const r = await catTurnAction(data.attempt.attempt_id, submission, elapsed, expectedItemId);
      if (!r.ok) {
        // Hold the question on screen with a Retry rather than dropping a
        // toast and clearing the dim — a CAT has no other way forward.
        // Retry re-invokes onCatTurn with the SAME expectedItemId, so a turn
        // that had actually landed replays instead of double-recording.
        turnTx.fail();
        return;
      }

      if (r.status === 'COMPLETE') {
        turnTx.reset();
        setShowResults(true);
        router.refresh();
        return;
      }

      // Deliberately does NOT advance an index. `current` is derived from
      // data.items.length for CAT, so the refresh below grows the array and
      // the new question becomes current on its own. Advancing here was the
      // bug: it pointed past the end of the array for a round-trip and
      // flashed the "No questions in this attempt." stub.
      turnTx.reset();
      router.refresh();
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

      await flushActive(); // bank the last segment before status flips
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
    primaryLabel    = 'Next';
    primaryDisabled = isLastQ;
    primaryHint     = isLastQ ? 'You\'re on the last question' : undefined;
    onPrimary       = onNext;

  } else if (isCat) {
    // CAT (slice 6b): one button, always. There is no Next (the server
    // decides what comes next) and no Finish (the engine decides when the
    // exam is over), so "Submit answer" is the only control the whole way
    // through — including on the final question, which the student cannot
    // know is final.
    const canSubmit = submitGate?.canSubmit ?? false;
    primaryLabel    = submitting ? 'Loading next…' : 'Submit answer';
    // isBlocking covers the error phase too, where `submitting` has gone false
    // but the overlay's Retry is the only way on — the footer must stay dead.
    primaryDisabled = !canSubmit || submitting || isBlocking(turnTx.phase);
    primaryHint     = canSubmit ? undefined : submitGate?.hint;
    onPrimary       = onCatTurn;

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
      primaryLabel    = 'Next';
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
      primaryLabel    = 'Next';
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
      primaryLabel    = 'Submit & continue';
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
  // §16.6 — the CJMM step strip is teaching scaffolding; hidden during a
  // live exam, restored in review (hideExamScaffold is false in review).
  const cjmmTopSlot = inCase && cjmmStep && !hideExamScaffold
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
        examLive={hideExamScaffold}
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
        examLive={hideExamScaffold}
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

  // CAT between-question wait (§10.1 + slice 6c). The question the student
  // just answered stays on screen — but it must LOOK finished, or it reads as
  // a live question that has stopped responding.
  //
  // `inert` is what actually disables the question: pointer-events alone still
  // leaves the controls keyboard-reachable, so a student could tab into and
  // change an answer that has already been submitted and scored.
  //
  // The escalation overlay (spinner / "Still loading…" / Retry) sits OUTSIDE
  // the inert wrapper — otherwise its Retry button would be unreachable too.
  // It drives off the transition phase, not `submitting`, so the error phase
  // (submitting already false) keeps the overlay up with Retry.
  if (isCat && isBlocking(turnTx.phase)) {
    questionArea = (
      <div className="rn-cat-tx">
        <div className="rn-cat-waiting" aria-busy={turnTx.phase !== 'error'} inert>
          {questionArea}
        </div>
        <CatTransition phase={turnTx.phase} onRetry={onCatTurn} />
      </div>
    );
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

      <Calculator open={calcOpen} onClose={() => setCalcOpen(false)} />

      {isSandbox && (
        <SandboxCoach
          onGoto={(key) => {
            const i = data.items.findIndex((it) => it.attempt_item_id === key);
            if (i >= 0) setCurrent(i);
          }}
          setGridOpen={setGridOpen}
          onEnd={() => router.push(data.exitHref)}
          calcOpen={calcOpen}
          currentSubmitted={
            currentItem ? answersByItem.has(currentItem.attempt_item_id) : false
          }
        />
      )}

      <RunnerTopbar
        sessionTitle={sessionTitle}
        modeLabel={modeLabel}
        current={current + 1}
        total={displayTotal}
        // Shown wherever flagging is offered — including in REVIEW, where it
        // renders the state but does not respond (§2.4). Hidden entirely in
        // the two forward-only modes, and in the sandbox (no attempt row).
        flag={
          flaggingOffered(data.attempt) && !isSandbox && currentFlagId
            ? {
                on:       flaggedAttemptItemIds.has(currentFlagId),
                busy:     flagBusy,
                editable: canEditFlag,
                onToggle: onToggleFlag,
              }
            : null
        }
        // Hidden entirely (null) rather than disabled when bookmarking is not
        // offered — a greyed control invites a "why?" whose honest answer
        // would name the reservation mechanism (§3.4). Also hidden in the
        // sandbox: the tutorial creates no attempt row, so there is nothing
        // to write against; its own steps land with slice 5.
        bookmark={
          data.canBookmark && !isSandbox && currentBookmarkId
            ? {
                on:       bookmarkedItemIds.has(currentBookmarkId),
                busy:     bookmarkBusy,
                onToggle: onToggleBookmark,
              }
            : null
        }
        statusLabel={statusLabel}
        caseMeta={hideExamScaffold ? undefined : caseMeta}
        clock={clockProps}
        gridToggle={
          gridAvailable
            ? { open: gridOpen, onToggle: () => setGridOpen((o) => !o) }
            : null
        }
        calcToggle={{ open: calcOpen, onToggle: () => setCalcOpen((o) => !o) }}
        sandbox={isSandbox}
        onExit={
          // Live (mid-flight) → confirm first. Review → leave directly.
          // A CAT review came from its summary page (§14.3: review is a
          // sub-action of the summary, reached History → summary → Review),
          // so Exit returns THERE — the richer CAT surface — rather than the
          // resolver's CAT-home default (which is right for a live exam, that
          // has no summary yet). Every other review keeps data.exitHref.
          data.mode === 'live'
            ? () => setShowExitConfirm(true)
            : () => router.push(
                isCat
                  ? `/student/bank/cat/result/${data.attempt.attempt_id}`
                  : data.exitHref,
              )
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

        {gridAvailable && (gridOpen ? (
          <RunnerGrid
            items={data.items}
            answers={answersByItem}
            flagged={flaggedAttemptItemIds}
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
            total={displayTotal}
            onExpand={() => setGridOpen(true)}
          />
        ))}
      </div>

      <RunnerFooter
        current={current + 1}
        total={displayTotal}
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
          isCat={isCat}
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
