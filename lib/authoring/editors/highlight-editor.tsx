// mynclex/lib/authoring/editors/highlight-editor.tsx
//
// HIGHLIGHT editor — eighth concrete editor in the rebuild. Passage
// with [[bracketed]] chunks; the student clicks the right ones to
// mark findings. Curator marks each chunk Correct or Wrong + adds
// optional per-chunk feedback.
//
// Two unique-to-HIGHLIGHT concerns vs the prior editors:
//   1. Live bracket parsing. The chunks list reflects [[…]] spans
//      currently in the stem. Removed-bracket cards become orphans
//      until re-typed or saved (parser drops orphans).
//   2. Toolbar button "[[ ]] Wrap / Insert" — wraps a text selection
//      in [[…]] or inserts an empty [[]] at cursor. Speeds up
//      authoring vs typing the brackets manually.
//
// Layout: stacked chunk cards (no paning). HIGHLIGHT cards are
// simpler than CLOZE blanks (one decision toggle + one feedback
// textarea per chunk) so up-to-12 stacked cards remains readable.
// Dual-mode preview ships from day one (slices 8-10 build with the
// PreviewToggle atom; slice 11 back-fills MCQ/TF/SATA/SELECT_N/MATRIX).
//
// FormData contract (must match save-question.ts HIGHLIGHT branch):
//   hl_chunk_id          (one per card, includes orphans)
//   hl_chunk_text        (parallel)
//   hl_chunk_decision    (parallel: 'correct' | 'wrong' | 'undecided')
//   hl_chunk_feedback    (parallel)
//   hl_chunk_in_passage  (parallel: 'true' | 'false')

'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  HIGHLIGHT_MIN_CHUNKS,
  HIGHLIGHT_MAX_CHUNKS,
  HIGHLIGHT_MIN_CORRECT,
  HIGHLIGHT_MIN_WRONG,
} from '@/lib/authoring/classifications';
import { ModalFrame } from '@/lib/authoring/atoms/modal-frame';
import { EditorActions } from '@/lib/authoring/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/authoring/atoms/editor-tabs';
import { StemField } from '@/lib/authoring/atoms/stem-field';
import { InstructionField } from '@/lib/authoring/atoms/instruction-field';
import { RationaleFields } from '@/lib/authoring/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/authoring/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/authoring/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/authoring/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/authoring/atoms/discard-confirm';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/authoring/atoms/preview-toggle';
import { useSaveAction } from '@/lib/authoring/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/authoring/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/authoring/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/authoring/actions/delete-question';
import type {
  HighlightEditorInitial,
  HighlightEditorChunk,
  HighlightDecision,
} from './highlight-row-mapper';

export type { HighlightEditorInitial };

// Non-greedy: [[foo]]bar[[baz]] must match twice, not once. Shared
// with the parser at lib/authoring/parsers/highlight.ts.
const BRACKET_RE = /\[\[(.+?)\]\]/g;
const STEM_DOM_ID = 'bank-stem';
const FORM_ID = 'auth-highlight-form';

type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Helpers (private).
// ─────────────────────────────────────────────────────────────

function extractPassageTexts(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(BRACKET_RE)) out.push(m[1]);
  return out;
}

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
// not the runner).
// ─────────────────────────────────────────────────────────────

interface HighlightPreviewProps {
  instruction: string;
  stem: string;
  chunks: HighlightEditorChunk[];
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

function HighlightPreview({
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

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  if (stem.trim() === '') {
    parts.push(
      <em key="placeholder" className="auth-hl-preview-placeholder">
        Write the passage above. Wrap any clickable finding with{' '}
        <code>[[double brackets]]</code>.
      </em>,
    );
  } else {
    for (const m of stem.matchAll(BRACKET_RE)) {
      const idx = m.index ?? 0;
      const text = stem.slice(cursor, idx);
      if (text) parts.push(<span key={`t${cursor}`}>{text}</span>);
      const inner = m[1];
      const decision = decisionByText.get(inner) ?? 'undecided';
      // In student view, all chunks look the same (clickable). In
      // answer-key view, decision colours are revealed.
      const className =
        'auth-hl-preview-chunk' +
        (viewMode === 'student'
          ? ' auth-hl-preview-chunk-neutral'
          : decision === 'correct'
            ? ' auth-hl-preview-chunk-correct'
            : decision === 'wrong'
              ? ' auth-hl-preview-chunk-wrong'
              : ' auth-hl-preview-chunk-undecided');
      parts.push(
        <span key={`hl${key++}`} className={className}>
          {inner}
        </span>,
      );
      cursor = idx + m[0].length;
    }
    const tail = stem.slice(cursor);
    if (tail) parts.push(<span key="tail">{tail}</span>);
  }

  const headerText =
    viewMode === 'answer-key'
      ? 'Curator preview · correct chunks highlighted'
      : 'Student preview · click the correct findings';

  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-card-header-text">{headerText}</div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
      <div className="auth-preview-card-body">
        {instruction.trim() && (
          <p className="auth-hl-preview-instruction">{instruction}</p>
        )}
        <div className="auth-hl-preview-passage">{parts}</div>
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
  onFeedback: (next: string) => void;
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
        <textarea
          className="auth-input auth-hl-chunk-feedback"
          rows={2}
          value={chunk.feedback}
          onChange={(e) => onFeedback(e.target.value)}
          placeholder="Per-chunk feedback (optional)…"
          disabled={disabled}
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
            value={c.feedback}
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
// HighlightEditorBody — two-pane edit + preview body. Mountable
// anywhere (modal host or sandbox).
// ─────────────────────────────────────────────────────────────

export interface HighlightEditorBodyProps {
  initial: HighlightEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
}

export function HighlightEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
}: HighlightEditorBodyProps) {
  const [tab, setTab] = useState<
    'content' | 'classification' | 'housekeeping'
  >('content');
  // HIGHLIGHT defaults to 'student' — curator usually sanity-checks
  // "does the passage read normally with these brackets" first.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [chunks, setChunks] = useState<HighlightEditorChunk[]>(initial.chunks);
  const [category, setCategory] = useState(initial.client_needs_category);

  // Re-flag in_passage on every chunk + auto-create cards for any
  // bracketed text that doesn't have a card yet. Stem is controlled
  // state (via <StemField>) so we can derive presence without DOM
  // listeners.
  const passageTexts = useMemo(() => extractPassageTexts(stem), [stem]);
  const passageSet = useMemo(() => new Set(passageTexts), [passageTexts]);

  useEffect(() => {
    setChunks((prev) => {
      const updated = prev.map((c) => ({
        ...c,
        in_passage: passageSet.has(c.text),
      }));
      // Pick the next available h-id from the highest numeric suffix.
      let nextN = 1;
      for (const c of prev) {
        const m = c.id.match(/^h(\d+)$/);
        if (m) nextN = Math.max(nextN, parseInt(m[1], 10) + 1);
      }
      const existingTexts = new Set(prev.map((c) => c.text));
      const fresh: HighlightEditorChunk[] = [];
      for (const text of passageTexts) {
        if (!existingTexts.has(text)) {
          fresh.push({
            id: `h${nextN++}`,
            text,
            decision: 'undecided',
            feedback: '',
            in_passage: true,
          });
          existingTexts.add(text);
        }
      }
      // No-op short-circuit: avoid resetting state when nothing changed.
      const sameInPassage = updated.every(
        (c, i) => c.in_passage === prev[i]?.in_passage,
      );
      if (sameInPassage && fresh.length === 0) return prev;
      return [...updated, ...fresh];
    });
  }, [passageTexts, passageSet]);

  // Order active cards by first appearance in the passage; orphans
  // tail. Duplicates in the passage map to the same card (keyed by
  // text), so we only emit each unique card once in the active list.
  const activeChunks = useMemo(() => {
    const byText = new Map<string, HighlightEditorChunk>();
    for (const c of chunks) {
      if (c.in_passage && !byText.has(c.text)) byText.set(c.text, c);
    }
    const ordered: HighlightEditorChunk[] = [];
    const picked = new Set<string>();
    for (const t of passageTexts) {
      const card = byText.get(t);
      if (card && !picked.has(card.id)) {
        ordered.push(card);
        picked.add(card.id);
      }
    }
    return ordered;
  }, [chunks, passageTexts]);

  const orphanChunks = chunks.filter((c) => !c.in_passage);

  const summary = summarise(activeChunks);
  const validity = contentValidity(summary);
  const contentIncomplete = validity !== 'ok';
  const classificationIncomplete = !category;

  // Toolbar counter
  const counterClass: ValidityState =
    summary.total === 0
      ? 'err'
      : summary.total < HIGHLIGHT_MIN_CHUNKS
        ? 'warn'
        : summary.total > HIGHLIGHT_MAX_CHUNKS
          ? 'err'
          : summary.undecided > 0
            ? 'warn'
            : 'ok';
  const counterText = `${summary.total} chunk${summary.total === 1 ? '' : 's'} detected`;

  // ─────────────────────────────────────────────────────────────
  // Toolbar actions
  // ─────────────────────────────────────────────────────────────

  function handleWrapOrInsert() {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;

    const start = stemEl.selectionStart;
    const end = stemEl.selectionEnd;
    const hasSelection = start !== end;
    const before = stem.slice(0, start);
    const selected = stem.slice(start, end);
    const after = stem.slice(end);

    let next: string;
    let cursorAfter: number;
    if (hasSelection) {
      // WRAP: surround selection with [[…]]. Cursor sits after the ]].
      next = `${before}[[${selected}]]${after}`;
      cursorAfter = end + 4;
    } else {
      // INSERT: drop [[]] at cursor, place caret between the brackets.
      next = `${before}[[]]${after}`;
      cursorAfter = start + 2;
    }
    setStem(next);

    // Restore focus + cursor after React commits.
    requestAnimationFrame(() => {
      const el = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cursorAfter, cursorAfter);
    });

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
    // Strip just the brackets, keep the inner text.
    setStem(stem.replace(BRACKET_RE, '$1'));
    setChunks([]);
    onDirty?.();
  }

  // ─────────────────────────────────────────────────────────────
  // Per-chunk mutations
  // ─────────────────────────────────────────────────────────────

  function setDecision(chunkId: string, next: 'correct' | 'wrong') {
    setChunks((prev) =>
      prev.map((c) => (c.id === chunkId ? { ...c, decision: next } : c)),
    );
  }

  function setFeedback(chunkId: string, next: string) {
    setChunks((prev) =>
      prev.map((c) => (c.id === chunkId ? { ...c, feedback: next } : c)),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs
        type="HIGHLIGHT"
        itemId={initial.itemId}
        surface={initial.surface}
      />

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

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
              <InstructionField
                value={instruction}
                onChange={setInstruction}
              />
              <StemField value={stem} onChange={setStem} />

              <div className="auth-fg">
                <div className="auth-label-row">
                  <label className="auth-label">Highlight chunks *</label>
                </div>
                <p className="auth-hint">
                  Wrap each clickable finding with double brackets:{' '}
                  <code>[[184/96]]</code>. Single brackets like{' '}
                  <code>[K+]</code> are literal passage text. Select
                  text and click <strong>Wrap / Insert</strong> to
                  bracket it; click with no selection to drop an empty{' '}
                  <code>[[]]</code> at the cursor.
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
                      (chunks.length === 0 && summary.total === 0)
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

                {/* Bounds summary */}
                <div className="auth-hl-bounds">
                  <span
                    className={
                      'auth-hl-bounds-item auth-hl-' +
                      (summary.total >= HIGHLIGHT_MIN_CHUNKS &&
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
                      onDecision={(d) => setDecision(c.id, d)}
                      onFeedback={(f) => setFeedback(c.id, f)}
                    />
                  ))}
                  {orphanChunks.map((c) => (
                    <ChunkCard
                      key={c.id}
                      chunk={c}
                      displayNumber={null}
                      isOrphan={true}
                      disabled={pending}
                      onDecision={(d) => setDecision(c.id, d)}
                      onFeedback={(f) => setFeedback(c.id, f)}
                    />
                  ))}
                </div>

                <HiddenSerialisers chunks={chunks} />
              </div>

              <RationaleFields
                defaultRationale={initial.rationale}
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
                  bloom_level: initial.bloom_level,
                  tags: initial.tags,
                }}
              />
            </TabPanel>

            <TabPanel id="housekeeping">
              <HousekeepingFields
                mode={initial.mode}
                defaults={{
                  marks: initial.marks,
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
            chunks={chunks}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>
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
      {confirmingDelete && (
        <div
          className="auth-delete-confirm"
          role="alertdialog"
          aria-label="Confirm delete"
        >
          <p className="auth-delete-confirm-title">
            Delete <code>{initial.itemId}</code>?
          </p>
          <p className="auth-delete-confirm-hint">
            This is irreversible. Type <strong>DELETE</strong> to confirm.
          </p>
          <input
            type="text"
            className="auth-input"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="Type DELETE"
            autoFocus
            disabled={del.pending}
          />
          <div className="auth-delete-confirm-actions">
            <button
              type="button"
              className="auth-btn auth-btn-ghost"
              onClick={cancelDelete}
              disabled={del.pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="auth-btn auth-btn-danger"
              onClick={confirmDelete}
              disabled={deleteText !== 'DELETE' || del.pending}
            >
              {del.pending ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        </div>
      )}
      <HighlightEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
      />
    </ModalFrame>
  );
}
