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

import { useMemo, useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  RunnerData,
  AnswerRow,
  SealedItem,
  UnsealedItem,
  SubmitAnswerResult,
} from '@/lib/bank/runner';
import type { GridFilter } from '@/lib/bank/runner';
import type {
  BankItemAnswer,
  McqAnswer,
  SataAnswer,
  SelectNAnswer,
} from '@/lib/scoring';
import type { SelectNContent, MatrixContent, ClozeContent, DragDropContent } from '@/lib/bank/types';
import type { MatrixAnswer, HighlightAnswer, ClozeAnswer, DragDropAnswer } from '@/lib/scoring';
import {
  isMcqComplete,
  isSataComplete,
  isSelectNComplete,
  isMatrixComplete,
  isHighlightComplete,
  isClozeComplete,
  isDragDropComplete,
} from '@/lib/bank/runner';
import { ErrorToast } from '@/lib/bank/atoms/error-toast';
import { RunnerTopbar }       from './runner-topbar';
import { RunnerFooter }       from './runner-footer';
import { RunnerGrid, RunnerGridHandle } from './runner-grid';
import { RunnerQuestionArea, type PerItemUnseal } from './runner-question-area';
import { Preflight }          from './preflight';
import { submitAnswerAction, completeAttemptAction } from './actions';

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

  const onAnswerChange = useCallback(
    (next: BankItemAnswer) => {
      if (!currentItem) return;
      setPendingAnswers((prev) => {
        const m = new Map(prev);
        m.set(currentItem.attempt_item_id, next);
        return m;
      });
    },
    [currentItem],
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

  // Topbar pill: live → "Untimed" placeholder (slice 4.5 wires real
  // timers); review → final-score readout.
  const statusLabel =
    data.mode === 'review' && data.attempt.final_score !== null
      ? `Score · ${formatPercent(data.attempt.final_score)}`
      : 'Untimed';

  // Branch the RunnerQuestionArea props at the call site so the child
  // gets clean discriminated-union props (review carries answerRow +
  // unseal, both required) — no defensive fallback inside per-type
  // runners. The "review-but-unseal-missing" branch is currently
  // unreachable in 4.1; surfaces only with slice 4.6 (Resume) where
  // server-stored answer rows arrive without client-side unseal data.
  let questionArea: React.ReactNode;
  if (!currentItem) {
    questionArea = (
      <div className="rn-q-wrap">
        <div className="rn-stub">No questions in this attempt.</div>
      </div>
    );
  } else if (itemMode === 'answering') {
    questionArea = (
      <RunnerQuestionArea
        item={currentItem}
        itemMode="answering"
        pendingAnswer={pendingForCurrent}
        onAnswerChange={onAnswerChange}
      />
    );
  } else if (answerRowForCurrent && unsealForCurrent) {
    questionArea = (
      <RunnerQuestionArea
        item={currentItem}
        itemMode="review"
        answerRow={answerRowForCurrent}
        unseal={unsealForCurrent}
      />
    );
  } else {
    questionArea = (
      <div className="rn-q-wrap">
        <div className="rn-stem">{currentItem.stem_snapshot}</div>
        <div className="rn-stub">Loading review data…</div>
      </div>
    );
  }

  return (
    <div className="rn">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      <RunnerTopbar
        modeLabel={modeLabel}
        current={current + 1}
        total={total}
        marked={marked.has(currentItem?.attempt_item_id ?? '')}
        statusLabel={statusLabel}
      />

      <div className="rn-body">
        <main className="rn-main">
          <div className="rn-main-scroll">
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

    // BOWTIE lands in the next 4.2 sub-slice — until then the per-type
    // runner shows a placeholder and submission is gated off.
    default:
      return {
        canSubmit:   false,
        submitValue: null,
        hint:        'This question type is not yet wired in slice 4.2',
      };
  }
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
