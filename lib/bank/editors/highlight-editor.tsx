// mynclex/lib/bank/editors/highlight-editor.tsx
//
// HIGHLIGHT editor — passage with [[bracketed]] clickable chunks; the
// student clicks the right findings. Curator marks each chunk Correct or
// Wrong + adds optional per-chunk feedback.
//
// Slice 6e (rich content) — the passage (stem) is now a RICH field. The
// [[chunk]] markers stay as PLAIN TEXT inside the formatted prose (Option B,
// decoupled — the same rule Cloze {N} follows). A curator can bold an
// abnormal value, add paragraphs/lists around the findings; the clickable
// chunk text itself stays plain (it's a clickable token, the runner styles
// it). The shared RichRenderWithSlots splices the clickable chunks into the
// formatted passage — one source for the runner AND this preview.
//
// Two unique-to-HIGHLIGHT concerns vs the prior editors:
//   1. Live bracket parsing. The chunks list reflects [[…]] spans currently
//      in the stem doc (scanned from its flattened text, so stray formatting
//      on a bracket is tolerated). Removed-bracket cards become orphans until
//      re-typed or saved (parser drops orphans).
//   2. Toolbar "[[ ]] Wrap / Insert" — wraps the rich-editor's selection in
//      [[…]] (or inserts an empty [[]] at the caret). Speeds up authoring vs
//      typing the brackets manually.
//
// FormData contract (must match save-question.ts HIGHLIGHT branch):
//   hl_chunk_id          (one per card, includes orphans)
//   hl_chunk_text        (parallel)
//   hl_chunk_decision    (parallel: 'correct' | 'wrong' | 'undecided')
//   hl_chunk_feedback    (parallel)
//   hl_chunk_in_passage  (parallel: 'true' | 'false')

'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  HIGHLIGHT_MIN_CHUNKS,
  HIGHLIGHT_MAX_CHUNKS,
  HIGHLIGHT_MIN_CORRECT,
  HIGHLIGHT_MIN_WRONG,
  HIGHLIGHT_RECOMMENDED_MIN_CHUNKS,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import {
  RovingProvider,
  RovingToolbar,
  RovingRichField,
  useRoving,
} from '@/lib/authoring/roving-rich';
import {
  RichStemField,
  RichInstructionField,
  RichRationaleFields,
  STEM_IMAGE_KEYS,
} from '@/lib/authoring/rich-atoms';
import { RichRender, RichRenderWithSlots } from '@/lib/authoring/rich-render';
import { curatorBankImageRenderer } from '@/lib/authoring/bank-image-render';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { useAuthUploadsInFlight } from '@/lib/authoring/use-uploads-in-flight';
import {
  parseRichDoc,
  serializeRichDoc,
  isEmptyRichDoc,
  EMPTY_RICH_DOC,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import {
  highlightChunkTexts,
  stripBracketsFromDoc,
  appendChunkToDoc,
} from './highlight-stem-doc';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/bank/atoms/preview-toggle';
import { useSaveAction } from '@/lib/bank/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/bank/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/bank/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/bank/actions/delete-question';
import type {
  HighlightEditorInitial,
  HighlightEditorChunk,
  HighlightDecision,
} from './highlight-row-mapper';

export type { HighlightEditorInitial };

// Non-greedy: [[foo]]bar[[baz]] must match twice, not once. Shared shape
// with the parser + highlight-stem-doc.
const BRACKET_PATTERN = /\[\[(.+?)\]\]/;
const FORM_ID = 'auth-highlight-form';

type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Helpers (private).
// ─────────────────────────────────────────────────────────────

interface ChunkSummary {
  total: number;
  correct: number;
  wrong: number;
  undecided: number;
}

function summarise(activeChunks: HighlightEditorChunk[]): ChunkSummary {
  return {
    total: activeChunks.length,
    correct: activeChunks.filter((c) => c.decision === 'correct').length,
    wrong: activeChunks.filter((c) => c.decision === 'wrong').length,
    undecided: activeChunks.filter((c) => c.decision === 'undecided').length,
  };
}

function contentValidity(s: ChunkSummary): ValidityState {
  if (s.total === 0) return 'err';
  if (s.total < HIGHLIGHT_MIN_CHUNKS) return 'err';
  if (s.total > HIGHLIGHT_MAX_CHUNKS) return 'err';
  if (s.undecided > 0) return 'warn';
  if (s.correct < HIGHLIGHT_MIN_CORRECT) return 'err';
  if (s.wrong < HIGHLIGHT_MIN_WRONG) return 'err';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// HighlightPreview — dual-mode preview rendered in the right pane.
// Student view: passage with chunks rendered as outlined "click me"
// spans, no decision colours. Answer-key view: same passage but
// correct chunks filled green, wrong chunks visibly distractor-styled.
// Chunks are NOT interactive in the preview (it's a render preview,
// not the runner). The rich passage's formatting survives verbatim;
// the clickable chunks are spliced in at each [[…]] marker.
// ─────────────────────────────────────────────────────────────

interface HighlightPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  chunks: HighlightEditorChunk[];
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function HighlightPreview({
  instruction,
  stem,
  chunks,
  viewMode,
  onViewModeChange,
}: HighlightPreviewProps) {
  // Text-keyed decision lookup — duplicate bracketed spans share the
  // same decision (matches parser's text-keyed handling).
  const decisionByText = useMemo(() => {
    const m = new Map<string, HighlightDecision>();
    for (const c of chunks) {
      if (c.in_passage && !m.has(c.text)) m.set(c.text, c.decision);
    }
    return m;
  }, [chunks]);

  // Render a non-interactive chunk span at each [[…]] marker. In student
  // view all chunks look the same (clickable affordance); in answer-key
  // view decision colours are revealed.
  const renderSlot = (inner: string): React.ReactNode => {
    const decision = decisionByText.get(inner) ?? 'undecided';
    const className =
      'auth-hl-preview-chunk' +
      (viewMode === 'student'
        ? ' auth-hl-preview-chunk-neutral'
        : decision === 'correct'
          ? ' auth-hl-preview-chunk-correct'
          : decision === 'wrong'
            ? ' auth-hl-preview-chunk-wrong'
            : ' auth-hl-preview-chunk-undecided');
    return <span className={className}>{inner}</span>;
  };

  const headerText =
    viewMode === 'answer-key'
      ? 'Answer key · curator view'
      : 'Pre-submit · student view';

  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-card-header-text">{headerText}</div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
      <div className="auth-preview-card-body">
        {!isEmptyRichDoc(instruction) && (
          <div className="auth-hl-preview-instruction">
            <RichRender doc={instruction} inline />
          </div>
        )}
        <div className="auth-hl-preview-passage">
          {isEmptyRichDoc(stem) ? (
            <em className="auth-hl-preview-placeholder">
              Write the passage above. Wrap any clickable finding with{' '}
              <code>[[double brackets]]</code>.
            </em>
          ) : (
            <RichRenderWithSlots
              doc={stem}
              pattern={BRACKET_PATTERN}
              renderSlot={renderSlot}
              custom={curatorBankImageRenderer}
            />
          )}
        </div>
        {viewMode === 'answer-key' && (
          <div className="auth-hl-preview-legend">
            <span className="auth-hl-preview-chunk auth-hl-preview-chunk-correct">
              correct
            </span>
            <span className="auth-hl-preview-chunk auth-hl-preview-chunk-wrong">
              wrong / distractor
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ChunkCard — one row per chunk. Decision toggle (Correct ✓ /
// Wrong ✗) on the right of the head, feedback textarea below.
// Orphan styling for cards whose text is no longer in the passage.
// ─────────────────────────────────────────────────────────────

interface ChunkCardProps {
  chunk: HighlightEditorChunk;
  displayNumber: number | null;
  isOrphan: boolean;
  disabled: boolean;
  onDecision: (next: 'correct' | 'wrong') => void;
  onFeedback: (next: RichDoc) => void;
}

function ChunkCard({
  chunk,
  displayNumber,
  isOrphan,
  disabled,
  onDecision,
  onFeedback,
}: ChunkCardProps) {
  const cardClass =
    'auth-hl-chunk-card' +
    (isOrphan
      ? ' auth-hl-chunk-card-orphan'
      : chunk.decision === 'correct'
        ? ' auth-hl-chunk-card-correct'
        : chunk.decision === 'wrong'
          ? ' auth-hl-chunk-card-wrong'
          : ' auth-hl-chunk-card-undecided');

  return (
    <div className={cardClass}>
      <div className="auth-hl-chunk-head">
        <div className="auth-hl-chunk-title">
          {/* Position number is meaningful only for active chunks
              (they have a place in the passage). Orphans have no
              position; the bracketed text + orphan badge identify
              them sufficiently without leaking the raw internal ID. */}
          {!isOrphan && displayNumber !== null && (
            <span className="auth-hl-chunk-number">{displayNumber}</span>
          )}
          <span className="auth-hl-chunk-text">[[{chunk.text}]]</span>
          {isOrphan && (
            <span className="auth-hl-orphan-badge">
              will be dropped on save
            </span>
          )}
        </div>
        <div
          className="auth-hl-chunk-toggle"
          role="group"
          aria-label="Correctness"
        >
          <button
            type="button"
            className={
              'auth-hl-chunk-toggle-btn' +
              (chunk.decision === 'correct'
                ? ' auth-hl-chunk-toggle-btn-active-correct'
                : '')
            }
            onClick={() => onDecision('correct')}
            disabled={disabled}
            aria-pressed={chunk.decision === 'correct'}
          >
            ✓ Correct
          </button>
          <button
            type="button"
            className={
              'auth-hl-chunk-toggle-btn' +
              (chunk.decision === 'wrong'
                ? ' auth-hl-chunk-toggle-btn-active-wrong'
                : '')
            }
            onClick={() => onDecision('wrong')}
            disabled={disabled}
            aria-pressed={chunk.decision === 'wrong'}
          >
            ✗ Wrong
          </button>
        </div>
      </div>

      {isOrphan && (
        <p className="auth-hl-orphan-tip">
          Re-wrap <code>[[{chunk.text}]]</code> in the passage to
          reconnect this card. Otherwise its decision is discarded on
          save.
        </p>
      )}
      {!isOrphan && chunk.decision === 'undecided' && (
        <p className="auth-hl-undecided-tip">
          Pick Correct or Wrong before saving.
        </p>
      )}

      <div className="auth-hl-chunk-body">
        {/* Feedback is rich (shows in the review feedback prose). All chunk
            cards render at once (no paning), but to keep the FormData arrays
            aligned we let HiddenSerialisers emit every chunk's feedback in
            lockstep, so this field uses noHiddenInput (the Bow-tie / Cloze
            pattern). Chunk text itself stays plain. */}
        <RovingRichField
          fieldKey={`hl-fb-${chunk.id}`}
          name="hl_chunk_feedback"
          value={chunk.feedback}
          onChange={onFeedback}
          inline
          noHiddenInput
          className="auth-rrf-option-fb"
          ariaLabel="Per-chunk feedback"
          placeholder="Per-chunk feedback (optional)…"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HiddenSerialisers — emit FormData inputs for every chunk
// (active + orphan), so toggling a chunk's bracket mid-session
// doesn't drop its decision. save-question.ts filters out
// in_passage='false' before calling parseHighlight.
// ─────────────────────────────────────────────────────────────

function HiddenSerialisers({ chunks }: { chunks: HighlightEditorChunk[] }) {
  return (
    <>
      {chunks.map((c) => (
        <Fragment key={`hid-${c.id}`}>
          <input type="hidden" name="hl_chunk_id" value={c.id} />
          <input type="hidden" name="hl_chunk_text" value={c.text} />
          <input
            type="hidden"
            name="hl_chunk_decision"
            value={c.decision}
          />
          <input
            type="hidden"
            name="hl_chunk_feedback"
            value={serializeRichDoc(c.feedback)}
          />
          <input
            type="hidden"
            name="hl_chunk_in_passage"
            value={String(c.in_passage)}
          />
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// RovingBridge — lifts the roving toolbar's active field + editor up to the
// editor body (which sits outside the provider) so "Wrap / Insert" can wrap
// the caret selection / focus the stem. Renders nothing. (The Cloze pattern.)
// ─────────────────────────────────────────────────────────────

function RovingBridge({
  onChange,
}: {
  onChange: (
    key: string | null,
    editor: Editor | null,
    setActiveKey: (k: string | null) => void,
  ) => void;
}) {
  const { activeKey, activeEditor, setActiveKey } = useRoving();
  useEffect(() => {
    onChange(activeKey, activeEditor, setActiveKey);
  }, [activeKey, activeEditor, setActiveKey, onChange]);
  return null;
}

// ─────────────────────────────────────────────────────────────
// HighlightEditorBody — two-pane edit + preview body. Mountable
// anywhere (modal host or sandbox).
// ─────────────────────────────────────────────────────────────

export interface HighlightEditorBodyProps {
  initial: HighlightEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function HighlightEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: HighlightEditorBodyProps) {
  const [tab, setTab] = useState<
    'content' | 'classification' | 'housekeeping'
  >('content');
  const [clientError, setClientError] = useState<string | null>(null);
  // HIGHLIGHT defaults to 'student' — curator usually sanity-checks
  // "does the passage read normally with these brackets" first.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');
  // Slice 8 — hold Save while a stem-image upload is in flight (saving
  // then would persist a not-yet-filled image block).
  const uploadsInFlight = useAuthUploadsInFlight();

  // Stem / instruction / rationale are rich docs (Slice 6e). Read-coerce via
  // parseRichDoc (legacy plain text wraps as paragraphs; no migration). The
  // [[chunk]] markers live as plain text inside the stem doc (Option B).
  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() =>
    parseRichDoc(initial.instruction),
  );
  const [rationale, setRationale] = useState<RichDoc>(() =>
    parseRichDoc(initial.rationale),
  );
  // Per-chunk decisions + feedback are keyed by the chunk's TEXT (matching the
  // parser, which keys decisions by text so duplicate bracketed spans share a
  // card). Keeping them text-keyed lets us DERIVE the active + orphan card
  // lists from the passage during render (no setState-in-effect) — and a
  // removed-then-retyped bracket recovers its decision for free, because the
  // entry persists in these maps as an orphan in between.
  const [decisions, setDecisions] = useState<Record<string, HighlightDecision>>(
    () => {
      const m: Record<string, HighlightDecision> = {};
      for (const c of initial.chunks) m[c.text] = c.decision;
      return m;
    },
  );
  const [feedbacks, setFeedbacks] = useState<Record<string, RichDoc>>(() => {
    const m: Record<string, RichDoc> = {};
    for (const c of initial.chunks) {
      if (!isEmptyRichDoc(c.feedback)) m[c.text] = c.feedback;
    }
    return m;
  });
  const [category, setCategory] = useState(initial.client_needs_category);

  // Bridge to the roving toolbar's live editor, so "Wrap / Insert" can wrap
  // the caret selection when the stem is the focused field, and focus the
  // stem (setActiveKey) on the append fallback (see handleWrapOrInsert below).
  const rovingRef = useRef<{
    key: string | null;
    editor: Editor | null;
    setActiveKey: ((k: string | null) => void) | null;
  }>({ key: null, editor: null, setActiveKey: null });
  const setRoving = useCallback(
    (
      key: string | null,
      editor: Editor | null,
      setActiveKey: (k: string | null) => void,
    ) => {
      rovingRef.current = { key, editor, setActiveKey };
    },
    [],
  );

  // Passage chunk texts in order (with duplicates), scanned from the stem doc's
  // flattened text (tolerates stray formatting on a bracket).
  const passageTexts = useMemo(() => highlightChunkTexts(stem), [stem]);
  const passageSet = useMemo(() => new Set(passageTexts), [passageTexts]);

  // Active cards — unique chunk texts in first-appearance order, each carrying
  // the decision/feedback from the text-keyed maps (default undecided/empty for
  // a freshly typed bracket). IDs are positional (h1, h2, …) — cosmetic for the
  // editor; the parser reassigns its own positional IDs on save.
  const activeChunks = useMemo<HighlightEditorChunk[]>(() => {
    const seen = new Set<string>();
    const out: HighlightEditorChunk[] = [];
    for (const t of passageTexts) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({
        id: `h${out.length + 1}`,
        text: t,
        decision: decisions[t] ?? 'undecided',
        feedback: feedbacks[t] ?? EMPTY_RICH_DOC,
        in_passage: true,
      });
    }
    return out;
  }, [passageTexts, decisions, feedbacks]);

  // Orphan cards — texts with stored decisions/feedback no longer in the
  // passage (a removed bracket). Kept so re-typing the bracket restores them.
  const orphanChunks = useMemo<HighlightEditorChunk[]>(() => {
    const texts = new Set<string>([
      ...Object.keys(decisions),
      ...Object.keys(feedbacks),
    ]);
    const out: HighlightEditorChunk[] = [];
    for (const t of texts) {
      if (passageSet.has(t)) continue;
      out.push({
        id: `orphan-${t}`,
        text: t,
        decision: decisions[t] ?? 'undecided',
        feedback: feedbacks[t] ?? EMPTY_RICH_DOC,
        in_passage: false,
      });
    }
    return out;
  }, [decisions, feedbacks, passageSet]);

  // Every card (active + orphan) — for the hidden FormData serialisers and the
  // preview's text-keyed decision lookup. Save filters in_passage=false.
  const allChunks = useMemo(
    () => [...activeChunks, ...orphanChunks],
    [activeChunks, orphanChunks],
  );

  const summary = summarise(activeChunks);
  const validity = contentValidity(summary);
  const contentIncomplete = validity !== 'ok';
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout. Per bank-marks-and-scoring §5.2:
  // HIGHLIGHT max = count of correct chunks. summary.correct already filters
  // by decision === 'correct', and activeChunks is already in-passage only.
  const liveMarks = summary.correct;

  // Soft advisory: the chunk count is within the saveable 2–12 range but below
  // the 3+ norm (i.e. exactly 2). Nudges, never blocks (advise > block).
  const chunkCountAdvisory =
    summary.total >= HIGHLIGHT_MIN_CHUNKS &&
    summary.total <= HIGHLIGHT_MAX_CHUNKS &&
    summary.total < HIGHLIGHT_RECOMMENDED_MIN_CHUNKS;

  // Toolbar counter — red outside the hard 2–12 range (blocks Save), amber
  // inside it but below the 3+ norm or with an undecided chunk, green when
  // clean and in the recommended range.
  const counterClass: ValidityState =
    summary.total < HIGHLIGHT_MIN_CHUNKS || summary.total > HIGHLIGHT_MAX_CHUNKS
      ? 'err'
      : summary.undecided > 0 || chunkCountAdvisory
        ? 'warn'
        : 'ok';
  const counterText = `${summary.total} chunk${summary.total === 1 ? '' : 's'} detected`;

  // ─────────────────────────────────────────────────────────────
  // Toolbar actions
  // ─────────────────────────────────────────────────────────────

  function handleWrapOrInsert() {
    const roving = rovingRef.current;
    // When the stem is the live (focused) roving field, wrap its selection in
    // [[…]] via Tiptap (or insert empty brackets at the caret). Otherwise we
    // append a placeholder chunk to the stem doc and focus the field — a clean
    // text marker the curator can edit (the decoupled-marker payoff).
    if (roving.key === 'stem' && roving.editor && !roving.editor.isDestroyed) {
      const ed = roving.editor;
      const { from, to } = ed.state.selection;
      if (from !== to) {
        // WRAP: replace the selection with [[<selected text>]]. textBetween
        // returns plain text (marks dropped) → the chunk text stays plain.
        const selected = ed.state.doc.textBetween(from, to, ' ');
        ed.chain().focus().insertContent(`[[${selected}]]`).run();
      } else {
        // INSERT: drop [[]] at the caret, place the cursor between the
        // brackets so the curator types the finding straight away.
        ed.chain().focus().insertContent('[[]]').run();
        const pos = ed.state.selection.from;
        ed.chain().setTextSelection(Math.max(0, pos - 2)).run();
      }
    } else {
      setStem((prev) => appendChunkToDoc(prev, '[[finding]]'));
      roving.setActiveKey?.('stem');
    }
    onDirty?.();
  }

  function handleClearAll() {
    if (
      !window.confirm(
        'Remove all [[chunks]] from the passage and discard their decisions? This cannot be undone without re-bracketing them.',
      )
    ) {
      return;
    }
    // Unwrap the brackets, keep the inner text as plain passage prose.
    setStem((prev) => stripBracketsFromDoc(prev));
    setDecisions({});
    setFeedbacks({});
    onDirty?.();
  }

  // ─────────────────────────────────────────────────────────────
  // Per-chunk mutations — keyed by chunk text (see the state above).
  // ─────────────────────────────────────────────────────────────

  function setDecision(text: string, next: 'correct' | 'wrong') {
    setDecisions((prev) => ({ ...prev, [text]: next }));
  }

  function setFeedback(text: string, next: RichDoc) {
    setFeedbacks((prev) => ({ ...prev, [text]: next }));
  }

  // ─────────────────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (uploadsInFlight) {
      setClientError('An image is still uploading — give it a moment, then save.');
      return;
    }
    if (contentIncomplete) {
      setTab('content');
      setClientError('Fill in the required fields on Content to continue.');
      return;
    }
    if (classificationIncomplete) {
      setTab('classification');
      setClientError('Pick a Client Needs category to continue.');
      return;
    }
    setClientError(null);
    onSubmit(new FormData(e.currentTarget));
  }

  function dismissError() {
    setClientError(null);
    onErrorDismiss?.();
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs
        type="HIGHLIGHT"
        itemId={initial.itemId}
        surface={initial.surface}
      />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={richTextToPlainLabel(initial.stem)}
      />
      <RovingProvider>
        <RovingBridge onChange={setRoving} />
        <div className="auth-split">
          <div className="auth-edit">
            <EditorTabs
              tabs={[
                {
                  id: 'content',
                  label: 'Content',
                  incomplete: contentIncomplete,
                },
                {
                  id: 'classification',
                  label: 'Classification',
                  incomplete: classificationIncomplete,
                },
                { id: 'housekeeping', label: 'Housekeeping' },
              ]}
              active={tab}
              onChange={(id) => setTab(id as typeof tab)}
            >
              <TabPanel id="content">
                <RovingToolbar
                  hint="Click into a field to format it"
                  imageFieldKeys={STEM_IMAGE_KEYS}
                />
                <RichInstructionField
                  value={instruction}
                  onChange={(doc) => { setInstruction(doc); onDirty?.(); }}
                />
                <RichStemField
                  value={stem}
                  onChange={(doc) => { setStem(doc); onDirty?.(); }}
                />

                <div className="auth-fg">
                  <div className="auth-label-row">
                    <label className="auth-label">Highlight chunks *</label>
                  </div>
                  <p className="auth-hint">
                    Click into the passage above to write it. Wrap each
                    clickable finding with double brackets:{' '}
                    <code>[[184/96]]</code>. Single brackets like{' '}
                    <code>[K+]</code> are literal passage text. Select
                    text and click <strong>Wrap / Insert</strong> to
                    bracket it; click with no selection to drop an empty{' '}
                    <code>[[]]</code> at the cursor. Add{' '}
                    {HIGHLIGHT_MIN_CHUNKS}–{HIGHLIGHT_MAX_CHUNKS} findings (at
                    least one correct + one distractor) — most items have{' '}
                    {HIGHLIGHT_RECOMMENDED_MIN_CHUNKS} or more. Formatting on a
                    chunk is tidied away on save (the clickable text stays
                    plain).
                  </p>

                  <div className="auth-hl-toolbar">
                    <button
                      type="button"
                      className="auth-btn auth-btn-primary"
                      onClick={handleWrapOrInsert}
                      disabled={pending}
                    >
                      [[ ]] Wrap / Insert chunk
                    </button>
                    <button
                      type="button"
                      className="auth-btn auth-btn-ghost"
                      onClick={handleClearAll}
                      disabled={
                        pending ||
                        (allChunks.length === 0 && summary.total === 0)
                      }
                    >
                      Clear all chunks
                    </button>
                    <span
                      className={`auth-hl-chunk-count auth-hl-${counterClass}`}
                    >
                      {counterText}
                    </span>
                  </div>

                  {/* Bounds summary. The chunk-count item shows green only at
                      the 3+ norm (amber at the saveable-but-lean 2); the (2–12)
                      label is the hard range. */}
                  <div className="auth-hl-bounds">
                    <span
                      className={
                        'auth-hl-bounds-item auth-hl-' +
                        (summary.total >= HIGHLIGHT_RECOMMENDED_MIN_CHUNKS &&
                        summary.total <= HIGHLIGHT_MAX_CHUNKS
                          ? 'ok'
                          : 'warn')
                      }
                    >
                      {summary.total} chunk{summary.total === 1 ? '' : 's'} ({HIGHLIGHT_MIN_CHUNKS}–{HIGHLIGHT_MAX_CHUNKS})
                    </span>
                    <span
                      className={
                        'auth-hl-bounds-item auth-hl-' +
                        (summary.correct >= HIGHLIGHT_MIN_CORRECT
                          ? 'ok'
                          : 'warn')
                      }
                    >
                      {summary.correct} correct (≥{HIGHLIGHT_MIN_CORRECT})
                    </span>
                    <span
                      className={
                        'auth-hl-bounds-item auth-hl-' +
                        (summary.wrong >= HIGHLIGHT_MIN_WRONG
                          ? 'ok'
                          : 'warn')
                      }
                    >
                      {summary.wrong} wrong (≥{HIGHLIGHT_MIN_WRONG})
                    </span>
                    <span
                      className={
                        'auth-hl-bounds-item auth-hl-' +
                        (summary.undecided === 0 ? 'ok' : 'warn')
                      }
                    >
                      {summary.undecided} undecided
                    </span>
                  </div>

                  {/* Soft advisory — count is within the saveable 2–12 range
                      but below the 3+ norm. Nudges, never blocks. */}
                  {chunkCountAdvisory && (
                    <p className="auth-hl-advisory">
                      Most NCLEX highlight items have{' '}
                      {HIGHLIGHT_RECOMMENDED_MIN_CHUNKS} or more findings. This
                      one has {summary.total} — that&apos;s fine to save, just
                      lean.
                    </p>
                  )}

                  {/* Stacked chunk cards (active first, then orphans). */}
                  <div className="auth-hl-chunks-wrap">
                    {activeChunks.length === 0 && orphanChunks.length === 0 && (
                      <div className="auth-hl-chunks-empty">
                        Wrap text in <code>[[double brackets]]</code> in
                        the passage to create your first chunk card.
                      </div>
                    )}
                    {activeChunks.map((c, idx) => (
                      <ChunkCard
                        key={c.id}
                        chunk={c}
                        displayNumber={idx + 1}
                        isOrphan={false}
                        disabled={pending}
                        onDecision={(d) => setDecision(c.text, d)}
                        onFeedback={(f) => setFeedback(c.text, f)}
                      />
                    ))}
                    {orphanChunks.map((c) => (
                      <ChunkCard
                        key={c.id}
                        chunk={c}
                        displayNumber={null}
                        isOrphan={true}
                        disabled={pending}
                        onDecision={(d) => setDecision(c.text, d)}
                        onFeedback={(f) => setFeedback(c.text, f)}
                      />
                    ))}
                  </div>

                  <HiddenSerialisers chunks={allChunks} />
                </div>

                <RichRationaleFields
                  rationale={rationale}
                  onRationaleChange={(doc) => { setRationale(doc); onDirty?.(); }}
                  defaultRationaleImg={initial.rationale_img}
                />
              </TabPanel>

              <TabPanel id="classification">
                <ClassificationFields
                  category={category}
                  onCategoryChange={setCategory}
                  defaults={{
                    client_needs_subcategory: initial.client_needs_subcategory,
                    nursing_subject: initial.nursing_subject,
                    body_system: initial.body_system,
                    topic: initial.topic,
                    subtopic: initial.subtopic,
                    difficulty: initial.difficulty,
                    difficulty_irt: initial.difficulty_irt,
                    difficulty_source: initial.difficulty_source,
                    bloom_level: initial.bloom_level,
                    tags: initial.tags,
                  }}
                />
              </TabPanel>

              <TabPanel id="housekeeping">
                <HousekeepingFields
                  mode={initial.mode}
                  questionType="HIGHLIGHT"
                  defaults={{
                    marks: liveMarks,
                    question_ref: initial.question_ref,
                    batch_id: initial.batch_id,
                    is_published: initial.is_published,
                    is_free_sample: initial.is_free_sample,
                    is_builder_visible: initial.is_builder_visible,
                    shuffle_options: initial.shuffle_options,
                  }}
                />
              </TabPanel>
            </EditorTabs>
          </div>

          <div className="auth-preview">
            <HighlightPreview
              instruction={instruction}
              stem={stem}
              chunks={allChunks}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      </RovingProvider>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// HighlightEditor — default standalone modal host. Same wiring
// as the other editors.
// ─────────────────────────────────────────────────────────────

export interface HighlightEditorProps {
  initial: HighlightEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function HighlightEditor({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: HighlightEditorProps) {
  const isEdit = initial.itemId !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const guard = useDirtyGuard({
    onClose,
    onSaveAndClose: () => {
      const form = document.getElementById(FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    },
  });

  const save = useSaveAction<SaveResult>(saveQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onSaved?.({ item_id: result.item_id, created: result.created });
        onClose();
      }
    },
  });

  const del = useSaveAction<DeleteResult>(deleteQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onDeleted?.(result.item_id);
        onClose();
      }
    },
  });

  const pending = save.pending || del.pending;
  const error = save.error ?? del.error;

  function startDelete() {
    setConfirmingDelete(true);
    setDeleteText('');
    save.clearError();
    del.clearError();
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteText('');
  }

  function confirmDelete() {
    if (!initial.itemId) return;
    if (deleteText !== 'DELETE') return;
    const fd = new FormData();
    fd.set('item_id', initial.itemId);
    fd.set('surface', initial.surface);
    del.submit(fd);
  }

  return (
    <ModalFrame
      title={
        isEdit ? `Edit Highlight — ${initial.itemId}` : 'New Highlight question'
      }
      onClose={pending ? () => undefined : guard.requestClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={pending || confirmingDelete || guard.confirming}
          onCancel={guard.requestClose}
          onDelete={isEdit ? startDelete : undefined}
          formId={FORM_ID}
        />
      }
    >
      {guard.confirming && (
        <DiscardConfirm
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discardAndClose}
          onSaveAndClose={guard.saveAndClose}
          pending={save.pending}
        />
      )}
      {confirmingDelete && initial.itemId && (
        <DeleteConfirm
          itemId={initial.itemId}
          deleteText={deleteText}
          pending={del.pending}
          onTextChange={setDeleteText}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
      <HighlightEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
        onErrorDismiss={() => {
          save.clearError();
          del.clearError();
        }}
      />
    </ModalFrame>
  );
}
