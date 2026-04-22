// mynclex/lib/bank/editors/highlight-editor.tsx
//
// Highlight authoring UI. The curator types a passage in the shell's
// stem textarea, wrapping clickable findings with [[double brackets]].
// Each bracketed span is detected and surfaced as a chunk card below
// the live preview. Curator marks each chunk Correct or Wrong and
// optionally adds per-chunk feedback.
//
// Stem ↔ editor sync uses `document.getElementById('bank-stem')` +
// an `input` event listener — same pattern as the Cloze editor from
// Slice 1.8. The shell owns the textarea; lifting stem into shared
// state for one editor would mean restructuring the shell.
//
// FormData contract (hidden inputs, 5 parallel arrays per card):
//   hl_chunk_id          (stable h1, h2, ... assigned on detection)
//   hl_chunk_text        (text between [[ and ]])
//   hl_chunk_decision    ('correct' | 'wrong' | 'undecided')
//   hl_chunk_feedback    (per-chunk feedback)
//   hl_chunk_in_passage  ('true' | 'false')

'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  HIGHLIGHT_MIN_CHUNKS,
  HIGHLIGHT_MAX_CHUNKS,
  HIGHLIGHT_MIN_CORRECT,
  HIGHLIGHT_MIN_WRONG,
} from '../classifications';

type Decision = 'correct' | 'wrong' | 'undecided';

interface ChunkRow {
  id: string;
  text: string;
  decision: Decision;
  feedback: string;
  in_passage: boolean;
}

// Non-greedy — [[foo]]bar[[baz]] must match twice, not once. Shared
// with the server parser (lib/bank/parsers/highlight.ts).
const BRACKET_RE = /\[\[(.+?)\]\]/g;
const STEM_DOM_ID = 'bank-stem';

function extractPassageTexts(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(BRACKET_RE)) out.push(m[1]);
  return out;
}

export function HighlightEditor({
  initialChunks,
  initialStem,
}: {
  initialChunks: ChunkRow[];
  initialStem: string;
}) {
  const [chunks, setChunks] = useState<ChunkRow[]>(() => initialChunks);

  // Mirror the stem textarea value into local state so the preview
  // re-renders on every keystroke.
  const [stemText, setStemText] = useState<string>(initialStem);

  // Stem -> editor sync. On each `input` event we:
  //   1. Refresh stemText (for preview)
  //   2. Flag existing cards with in_passage based on the passage texts
  //   3. Auto-create a card for any bracketed text without a matching
  //      card yet, with decision='undecided'
  useEffect(() => {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;

    const recompute = () => {
      const value = stemEl.value;
      setStemText(value);
      const presentTexts = extractPassageTexts(value);
      const presentSet = new Set(presentTexts);

      setChunks((prev) => {
        const updated = prev.map((c) => ({ ...c, in_passage: presentSet.has(c.text) }));
        const existingTexts = new Set(prev.map((c) => c.text));

        // Pick the next h-id from the highest numeric suffix already used.
        let nextN = 1;
        for (const c of prev) {
          const match = c.id.match(/^h(\d+)$/);
          if (match) nextN = Math.max(nextN, parseInt(match[1], 10) + 1);
        }

        const freshCards: ChunkRow[] = [];
        for (const text of presentTexts) {
          if (!existingTexts.has(text)) {
            freshCards.push({
              id: `h${nextN++}`,
              text,
              decision: 'undecided',
              feedback: '',
              in_passage: true,
            });
            existingTexts.add(text);
          }
        }
        return [...updated, ...freshCards];
      });
    };

    recompute();
    stemEl.addEventListener('input', recompute);
    return () => {
      stemEl.removeEventListener('input', recompute);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Toolbar actions
  // ─────────────────────────────────────────────────────────────

  const handleWrapOrInsert = useCallback(() => {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;

    const start = stemEl.selectionStart;
    const end = stemEl.selectionEnd;
    const hasSelection = start !== end;
    const before = stemEl.value.slice(0, start);
    const selected = stemEl.value.slice(start, end);
    const after = stemEl.value.slice(end);

    if (hasSelection) {
      // WRAP: surround selection with [[...]]. Cursor sits after the ]].
      stemEl.value = `${before}[[${selected}]]${after}`;
      const newPos = end + 4;
      stemEl.setSelectionRange(newPos, newPos);
    } else {
      // INSERT: drop [[]] at cursor, place caret between the brackets.
      stemEl.value = `${before}[[]]${after}`;
      const newPos = start + 2;
      stemEl.setSelectionRange(newPos, newPos);
    }

    stemEl.dispatchEvent(new Event('input', { bubbles: true }));
    stemEl.focus();
  }, []);

  const handleClearAll = useCallback(() => {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;
    if (!window.confirm('Remove all [[chunks]] from the passage and drop their cards? This cannot be undone without re-entering them.')) return;
    // Keep the inner text, drop just the brackets.
    stemEl.value = stemEl.value.replace(BRACKET_RE, '$1');
    stemEl.dispatchEvent(new Event('input', { bubbles: true }));
    setChunks([]);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Per-chunk mutations
  // ─────────────────────────────────────────────────────────────

  function setDecision(chunkId: string, next: 'correct' | 'wrong') {
    setChunks((prev) => prev.map((c) => (c.id === chunkId ? { ...c, decision: next } : c)));
  }
  function setFeedback(chunkId: string, next: string) {
    setChunks((prev) => prev.map((c) => (c.id === chunkId ? { ...c, feedback: next } : c)));
  }

  // ─────────────────────────────────────────────────────────────
  // Derived state for preview + bounds bar
  // ─────────────────────────────────────────────────────────────

  // Order chunks by first appearance in the passage, then append orphans.
  const activeCards = useMemo(() => {
    const texts = extractPassageTexts(stemText);
    const seenTextToCard = new Map<string, ChunkRow>();
    for (const c of chunks) if (c.in_passage && !seenTextToCard.has(c.text)) seenTextToCard.set(c.text, c);
    const ordered: ChunkRow[] = [];
    const picked = new Set<string>();
    for (const t of texts) {
      const card = seenTextToCard.get(t);
      if (card && !picked.has(card.id)) {
        ordered.push(card);
        picked.add(card.id);
      }
    }
    return ordered;
  }, [stemText, chunks]);
  const orphanCards = chunks.filter((c) => !c.in_passage);

  const totalInPassage = activeCards.length;
  const correctCount = activeCards.filter((c) => c.decision === 'correct').length;
  const wrongCount   = activeCards.filter((c) => c.decision === 'wrong').length;
  const undecidedCount = activeCards.filter((c) => c.decision === 'undecided').length;

  const chunkCountClass =
    totalInPassage === 0                          ? 'err'
    : totalInPassage < HIGHLIGHT_MIN_CHUNKS       ? 'warn'
    : totalInPassage > HIGHLIGHT_MAX_CHUNKS       ? 'err'
    : undecidedCount > 0                          ? 'warn'
    : 'ok';

  return (
    <div className="bank-fg">
      <div className="bank-label-row">
        <label className="bank-label">Highlight chunks *</label>
      </div>
      <p className="bank-hint">
        Write the passage in the Stem field above. Wrap each clickable
        finding with double square brackets: <code>[[184/96]]</code>.
        Single brackets like <code>[K+]</code> are literal passage text.
      </p>

      {/* Toolbar */}
      <div className="bank-hl-passage-toolbar">
        <button
          type="button"
          className="bank-hl-toolbar-btn primary"
          onClick={handleWrapOrInsert}
        >
          [[ ]] Wrap / Insert chunk
        </button>
        <button
          type="button"
          className="bank-hl-toolbar-btn danger"
          onClick={handleClearAll}
          disabled={chunks.length === 0 && totalInPassage === 0}
        >
          Clear all chunks
        </button>
        <span className={`bank-hl-chunk-count ${chunkCountClass}`}>
          <strong>{totalInPassage}</strong> chunk{totalInPassage === 1 ? '' : 's'} detected
        </span>
      </div>

      <p className="bank-hl-smart-tip">
        Select text and click <strong>Wrap / Insert</strong> to bracket
        it; click with no selection to insert an empty <code>[[]]</code>
        at the cursor and type the chunk text between.
      </p>

      {/* Preview */}
      <HighlightPreview stemText={stemText} chunks={chunks} />

      {/* Bounds summary */}
      <div className="bank-hl-bounds">
        <span className={`bank-hl-bounds-item ${totalInPassage >= HIGHLIGHT_MIN_CHUNKS && totalInPassage <= HIGHLIGHT_MAX_CHUNKS ? 'ok' : 'warn'}`}>
          {totalInPassage} chunk{totalInPassage === 1 ? '' : 's'} ({HIGHLIGHT_MIN_CHUNKS}–{HIGHLIGHT_MAX_CHUNKS})
        </span>
        <span className={`bank-hl-bounds-item ${correctCount >= HIGHLIGHT_MIN_CORRECT ? 'ok' : 'warn'}`}>
          {correctCount} correct (≥{HIGHLIGHT_MIN_CORRECT})
        </span>
        <span className={`bank-hl-bounds-item ${wrongCount >= HIGHLIGHT_MIN_WRONG ? 'ok' : 'warn'}`}>
          {wrongCount} wrong (≥{HIGHLIGHT_MIN_WRONG})
        </span>
        <span className={`bank-hl-bounds-item ${undecidedCount === 0 ? 'ok' : 'warn'}`}>
          {undecidedCount} undecided
        </span>
      </div>

      {/* Chunk cards */}
      <div className="bank-hl-chunks-wrap">
        {activeCards.length === 0 && orphanCards.length === 0 && (
          <div className="bank-hl-chunks-empty">
            Wrap text in <code>[[double brackets]]</code> to create your
            first chunk card.
          </div>
        )}
        {activeCards.map((c, idx) => (
          <ChunkCard
            key={c.id}
            chunk={c}
            displayNumber={idx + 1}
            isOrphan={false}
            onDecision={(d) => setDecision(c.id, d)}
            onFeedback={(f) => setFeedback(c.id, f)}
          />
        ))}
        {orphanCards.map((c) => (
          <ChunkCard
            key={c.id}
            chunk={c}
            displayNumber={null}
            isOrphan={true}
            onDecision={(d) => setDecision(c.id, d)}
            onFeedback={(f) => setFeedback(c.id, f)}
          />
        ))}
      </div>

      <HiddenSerialisers chunks={chunks} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function HighlightPreview({
  stemText,
  chunks,
}: {
  stemText: string;
  chunks: ChunkRow[];
}) {
  // Text-keyed decision lookup so duplicate chunks render consistently.
  const decisionByText = useMemo(() => {
    const m = new Map<string, Decision>();
    for (const c of chunks) if (c.in_passage && !m.has(c.text)) m.set(c.text, c.decision);
    return m;
  }, [chunks]);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of stemText.matchAll(BRACKET_RE)) {
    const idx = match.index ?? 0;
    parts.push(<span key={`t${cursor}`}>{stemText.slice(cursor, idx)}</span>);
    const text = match[1];
    const d = decisionByText.get(text) ?? 'undecided';
    parts.push(
      <span key={`hl${key++}`} className={`bank-hl-preview-chunk ${d}`}>
        {text}
        {d === 'undecided' && <span className="bank-hl-preview-chunk-hint">— not decided</span>}
      </span>,
    );
    cursor = idx + match[0].length;
  }
  parts.push(<span key={`t${cursor}-tail`}>{stemText.slice(cursor)}</span>);

  return (
    <div className="bank-hl-preview">
      <div className="bank-hl-preview-label">★ Answer-key preview</div>
      <div className="bank-hl-preview-passage">
        {stemText.trim() === '' ? (
          <em className="bank-hl-preview-placeholder">
            Passage with <code>[[bracketed]]</code> findings will appear here.
          </em>
        ) : (
          parts
        )}
      </div>
      <div className="bank-hl-preview-legend">
        <span className="bank-hl-preview-chunk correct">correct</span>
        <span className="bank-hl-preview-chunk wrong">wrong / distractor</span>
        <span className="bank-hl-preview-chunk undecided">not decided</span>
      </div>
    </div>
  );
}

function ChunkCard({
  chunk,
  displayNumber,
  isOrphan,
  onDecision,
  onFeedback,
}: {
  chunk: ChunkRow;
  displayNumber: number | null;
  isOrphan: boolean;
  onDecision: (d: 'correct' | 'wrong') => void;
  onFeedback: (f: string) => void;
}) {
  const cardClass =
    isOrphan                       ? 'orphan'
    : chunk.decision === 'correct' ? 'correct'
    : chunk.decision === 'wrong'   ? 'wrong'
    : 'warn';
  return (
    <div className={`bank-hl-chunk-card ${cardClass}`}>
      <div className="bank-hl-chunk-head">
        <div className="bank-hl-chunk-title">
          <span className="bank-hl-chunk-id">{displayNumber ?? chunk.id}</span>
          <span className="bank-hl-chunk-text">[[{chunk.text}]]</span>
          {isOrphan && (
            <span className="bank-hl-orphan-badge">will be dropped on save</span>
          )}
        </div>
        <div className="bank-hl-chunk-toggle" role="group" aria-label="Correctness">
          <button
            type="button"
            className={`bank-hl-chunk-toggle-btn ${chunk.decision === 'correct' ? 'active correct' : ''}`}
            onClick={() => onDecision('correct')}
            aria-pressed={chunk.decision === 'correct'}
          >
            ✓ Correct
          </button>
          <button
            type="button"
            className={`bank-hl-chunk-toggle-btn ${chunk.decision === 'wrong' ? 'active wrong' : ''}`}
            onClick={() => onDecision('wrong')}
            aria-pressed={chunk.decision === 'wrong'}
          >
            ✗ Wrong
          </button>
        </div>
      </div>

      {isOrphan && (
        <p className="bank-hl-orphan-tip">
          Re-wrap <code>[[{chunk.text}]]</code> in the passage to reconnect
          this card, or leave it — the parser drops orphans on save.
        </p>
      )}
      {!isOrphan && chunk.decision === 'undecided' && (
        <p className="bank-hl-warn-tip">
          Pick Correct or Wrong before saving.
        </p>
      )}

      <div className="bank-hl-chunk-body">
        <textarea
          className="bank-hl-chunk-feedback"
          rows={2}
          value={chunk.feedback}
          onChange={(e) => onFeedback(e.target.value)}
          placeholder="Per-chunk feedback (optional)…"
        />
      </div>
    </div>
  );
}

function HiddenSerialisers({ chunks }: { chunks: ChunkRow[] }) {
  return (
    <>
      {chunks.map((c) => (
        <Fragment key={`hid-${c.id}`}>
          <input type="hidden" name="hl_chunk_id" value={c.id} />
          <input type="hidden" name="hl_chunk_text" value={c.text} />
          <input type="hidden" name="hl_chunk_decision" value={c.decision} />
          <input type="hidden" name="hl_chunk_feedback" value={c.feedback} />
          <input type="hidden" name="hl_chunk_in_passage" value={String(c.in_passage)} />
        </Fragment>
      ))}
    </>
  );
}
