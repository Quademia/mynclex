// mynclex/lib/bank/editors/cloze-editor.tsx
//
// Cloze authoring UI. The curator types a sentence with {N} markers in
// the shell's stem textarea; each marker corresponds to a blank card
// below the preview. Click-to-insert adds the next available marker at
// the cursor; removing a marker greys out its card (orphan); re-typing
// the marker re-activates the card.
//
// Stem ↔ editor sync uses `document.getElementById('bank-stem')` +
// an `input` event listener. The shell owns the stem textarea, and
// lifting it into shared React state would mean restructuring the
// shell for this one editor. The read-from-DOM path is explicit and
// scoped to the mounted-Cloze case only.
//
// FormData contract (hidden inputs):
//   cloze_blank_id               (one per card, includes orphans)
//   cloze_blank_in_stem          (parallel: "true" | "false")
//   cloze_choice_id_<bid>        (repeated, per choice in that blank)
//   cloze_choice_text_<bid>      (parallel)
//   cloze_choice_feedback_<bid>  (parallel)
//   cloze_correct_<bid>          (single radio value — correct choice ID)

'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CLOZE_MIN_BLANKS,
  CLOZE_MAX_BLANKS,
  CLOZE_MIN_CHOICES,
  CLOZE_MAX_CHOICES,
} from '../classifications';
import { makePrefixer } from '../field-prefix';

interface ChoiceRow {
  id: string;
  text: string;
  feedback: string;
}

interface BlankRow {
  id: string;
  choices: ChoiceRow[];
  correct_id: string;
  in_stem: boolean;
}

const MARKER_RE = /\{(\d+)\}/g;
const STEM_DOM_ID = 'bank-stem';

function parseStemMarkers(value: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(value)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export function ClozeEditor({
  initialBlanks,
  initialStem,
  fieldPrefix = '',
}: {
  initialBlanks: BlankRow[];
  initialStem: string;
  fieldPrefix?: string;
}) {
  // The top-level ClozeEditor doesn't emit any name= attributes of
  // its own — BlankCard and HiddenSerialisers receive fieldPrefix and
  // create their own prefixers.
  const [blanks, setBlanks] = useState<BlankRow[]>(() =>
    initialBlanks.length > 0
      ? initialBlanks
      : defaultBlanks(),
  );

  // Mirror the stem textarea value into local state so the live preview
  // updates on every keystroke. Initialised from the prop; kept in sync
  // via the DOM event listener below.
  const [stemText, setStemText] = useState<string>(initialStem);

  // Wire the stem <textarea> -> editor sync. The shell renders the
  // textarea with id="bank-stem"; we look it up after mount and listen
  // for 'input' events. On every change we:
  //   1. Refresh the local stemText mirror (for the preview)
  //   2. Re-flag each card's in_stem based on current markers
  useEffect(() => {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;

    const recompute = () => {
      const value = stemEl.value;
      setStemText(value);
      const present = new Set(parseStemMarkers(value).map((n) => `b${n}`));
      setBlanks((prev) => prev.map((b) => ({ ...b, in_stem: present.has(b.id) })));
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

  const handleAddBlank = useCallback(() => {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;

    const presentNs = new Set(parseStemMarkers(stemEl.value));
    let nextN = 1;
    while (presentNs.has(nextN)) nextN++;
    if (nextN > CLOZE_MAX_BLANKS) {
      window.alert(`Maximum ${CLOZE_MAX_BLANKS} blanks per question.`);
      return;
    }

    // Insert the marker at the cursor position, prefixed with a space if
    // the character immediately before isn't whitespace.
    const start = stemEl.selectionStart;
    const end = stemEl.selectionEnd;
    const before = stemEl.value.slice(0, start);
    const after = stemEl.value.slice(end);
    const needsLeadingSpace = start > 0 && !/\s$/.test(before);
    const insert = `${needsLeadingSpace ? ' ' : ''}{${nextN}}`;
    stemEl.value = `${before}${insert}${after}`;
    const newCursor = start + insert.length;
    stemEl.setSelectionRange(newCursor, newCursor);
    stemEl.dispatchEvent(new Event('input', { bubbles: true }));
    stemEl.focus();

    // Reuse an existing card with the same id (orphan) if present,
    // otherwise create a fresh card with CLOZE_MIN_CHOICES empty choices.
    setBlanks((prev) => {
      const existing = prev.find((b) => b.id === `b${nextN}`);
      if (existing) {
        return prev.map((b) => (b.id === `b${nextN}` ? { ...b, in_stem: true } : b));
      }
      return [
        ...prev,
        {
          id: `b${nextN}`,
          choices: Array.from({ length: CLOZE_MIN_CHOICES }, (_, i) => ({
            id: `c${i + 1}`,
            text: '',
            feedback: '',
          })),
          correct_id: 'c1',
          in_stem: true,
        },
      ];
    });
  }, []);

  const handleClearAll = useCallback(() => {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;
    if (!window.confirm('Remove all blanks and their choices? This cannot be undone without re-entering them.')) return;
    stemEl.value = stemEl.value.replace(MARKER_RE, '').replace(/ +/g, ' ').trim();
    stemEl.dispatchEvent(new Event('input', { bubbles: true }));
    setBlanks([]);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Per-blank mutations
  // ─────────────────────────────────────────────────────────────

  function updateBlank(blankId: string, mut: (b: BlankRow) => BlankRow) {
    setBlanks((prev) => prev.map((b) => (b.id === blankId ? mut(b) : b)));
  }

  function addChoice(blankId: string) {
    updateBlank(blankId, (b) => {
      if (b.choices.length >= CLOZE_MAX_CHOICES) return b;
      const used = new Set(b.choices.map((c) => c.id));
      let n = 1;
      while (used.has(`c${n}`)) n++;
      return {
        ...b,
        choices: [...b.choices, { id: `c${n}`, text: '', feedback: '' }],
      };
    });
  }

  function removeChoice(blankId: string, choiceId: string) {
    updateBlank(blankId, (b) => {
      if (b.choices.length <= CLOZE_MIN_CHOICES) return b;
      const nextChoices = b.choices.filter((c) => c.id !== choiceId);
      // If we just removed the picked-correct choice, fall back to the
      // first remaining choice so the blank always has a correct set.
      const nextCorrect = b.correct_id === choiceId ? nextChoices[0].id : b.correct_id;
      return { ...b, choices: nextChoices, correct_id: nextCorrect };
    });
  }

  function setChoiceText(blankId: string, choiceId: string, text: string) {
    updateBlank(blankId, (b) => ({
      ...b,
      choices: b.choices.map((c) => (c.id === choiceId ? { ...c, text } : c)),
    }));
  }

  function setChoiceFeedback(blankId: string, choiceId: string, feedback: string) {
    updateBlank(blankId, (b) => ({
      ...b,
      choices: b.choices.map((c) => (c.id === choiceId ? { ...c, feedback } : c)),
    }));
  }

  function setCorrect(blankId: string, choiceId: string) {
    updateBlank(blankId, (b) => ({ ...b, correct_id: choiceId }));
  }

  // ─────────────────────────────────────────────────────────────
  // Derived values for preview + header
  // ─────────────────────────────────────────────────────────────

  const markerOrder = useMemo(() => parseStemMarkers(stemText), [stemText]);
  const activeCount = markerOrder.length;
  const counterClass =
    activeCount === 0                  ? 'err'
    : activeCount < CLOZE_MIN_BLANKS   ? 'warn'
    : activeCount > CLOZE_MAX_BLANKS   ? 'err'
    : 'ok';
  const counterText = `${activeCount} blank${activeCount === 1 ? '' : 's'}`;

  // Render helpers
  const blankById = new Map(blanks.map((b) => [b.id, b]));
  const activeCards = blanks.filter((b) => b.in_stem);
  const orphanCards = blanks.filter((b) => !b.in_stem);

  return (
    <div className="bank-fg">
      <div className="bank-label-row">
        <label className="bank-label">Cloze blanks *</label>
      </div>
      <p className="bank-hint">
        Type the sentence in the Stem field above. Use <code>{'{1}'}</code>,{' '}
        <code>{'{2}'}</code>, … for each blank, or click “+ Add blank” to
        insert the next one at the cursor. Gaps like <code>{'{1} {3}'}</code>{' '}
        are auto-renumbered to <code>{'{1} {2}'}</code> on save.
      </p>

      {/* Toolbar */}
      <div className="bank-cz-stem-toolbar">
        <button
          type="button"
          className="bank-cz-toolbar-btn primary"
          onClick={handleAddBlank}
          disabled={activeCount >= CLOZE_MAX_BLANKS}
        >
          + Add blank
        </button>
        <button
          type="button"
          className="bank-cz-toolbar-btn danger"
          onClick={handleClearAll}
          disabled={blanks.length === 0 && activeCount === 0}
        >
          Clear all blanks
        </button>
        <span className={`bank-cz-marker-count ${counterClass}`}>{counterText}</span>
      </div>

      {/* Live preview */}
      <ClozePreview stemText={stemText} markerOrder={markerOrder} blankById={blankById} />

      {/* Blank cards */}
      <div className="bank-cz-blanks-wrap">
        {activeCards.length === 0 && orphanCards.length === 0 && (
          <div className="bank-cz-blank-empty">
            Click <strong>+ Add blank</strong> to create your first blank.
          </div>
        )}

        {activeCards.map((b) => {
          const stemPosition = markerOrder.indexOf(parseInt(b.id.slice(1), 10));
          return (
            <BlankCard
              key={b.id}
              blank={b}
              displayNumber={stemPosition >= 0 ? stemPosition + 1 : null}
              isOrphan={false}
              onAddChoice={() => addChoice(b.id)}
              onRemoveChoice={(cid) => removeChoice(b.id, cid)}
              onChoiceText={(cid, text) => setChoiceText(b.id, cid, text)}
              onChoiceFeedback={(cid, fb) => setChoiceFeedback(b.id, cid, fb)}
              onCorrect={(cid) => setCorrect(b.id, cid)}
              fieldPrefix={fieldPrefix}
            />
          );
        })}

        {orphanCards.map((b) => (
          <BlankCard
            key={b.id}
            blank={b}
            displayNumber={null}
            isOrphan={true}
            onAddChoice={() => addChoice(b.id)}
            onRemoveChoice={(cid) => removeChoice(b.id, cid)}
            onChoiceText={(cid, text) => setChoiceText(b.id, cid, text)}
            onChoiceFeedback={(cid, fb) => setChoiceFeedback(b.id, cid, fb)}
            onCorrect={(cid) => setCorrect(b.id, cid)}
            fieldPrefix={fieldPrefix}
          />
        ))}
      </div>

      {/* Hidden serialisers — every card (incl. orphans) so FormData
          round-trips if the user toggles orphan/active during editing.
          actions.ts filters out in_stem=false before calling the parser. */}
      <HiddenSerialisers blanks={blanks} fieldPrefix={fieldPrefix} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function ClozePreview({
  stemText,
  markerOrder,
  blankById,
}: {
  stemText: string;
  markerOrder: number[];
  blankById: Map<string, BlankRow>;
}) {
  // Split the stem at each {N} and splice a chip for the correct choice.
  // Using matchAll keeps the iteration stateless — MARKER_RE's lastIndex
  // is never mutated inside the component (react-hooks/immutability).
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let chipKey = 0;
  for (const m of stemText.matchAll(MARKER_RE)) {
    const idx = m.index ?? 0;
    parts.push(
      <span key={`t${cursor}`}>{stemText.slice(cursor, idx)}</span>,
    );
    const n = parseInt(m[1], 10);
    const displayN = markerOrder.indexOf(n) + 1; // positional index
    const card = blankById.get(`b${n}`);
    const correct = card?.choices.find((c) => c.id === card.correct_id);
    const pillText = correct?.text?.trim() ? correct.text : '(not yet picked)';
    const pillClass = correct?.text?.trim() ? 'filled' : 'empty';
    parts.push(
      <span key={`pill${chipKey++}`} className={`bank-cz-preview-pill ${pillClass}`}>
        <span className="bank-cz-preview-pill-num">{displayN || n}</span>
        <span className="bank-cz-preview-pill-text">{pillText}</span>
      </span>,
    );
    cursor = idx + m[0].length;
  }
  parts.push(<span key={`t${cursor}-tail`}>{stemText.slice(cursor)}</span>);

  return (
    <div className="bank-cz-preview">
      <div className="bank-cz-preview-label">★ Answer-key preview</div>
      <div className="bank-cz-preview-sentence">
        {stemText.trim() === '' ? (
          <em className="bank-cz-preview-placeholder">
            Sentence with {'{1}'}, {'{2}'}, … markers will appear here.
          </em>
        ) : (
          parts
        )}
      </div>
    </div>
  );
}

function BlankCard({
  blank,
  displayNumber,
  isOrphan,
  onAddChoice,
  onRemoveChoice,
  onChoiceText,
  onChoiceFeedback,
  onCorrect,
  fieldPrefix,
}: {
  blank: BlankRow;
  displayNumber: number | null;
  isOrphan: boolean;
  onAddChoice: () => void;
  onRemoveChoice: (cid: string) => void;
  onChoiceText: (cid: string, text: string) => void;
  onChoiceFeedback: (cid: string, fb: string) => void;
  onCorrect: (cid: string) => void;
  fieldPrefix: string;
}) {
  const fn = makePrefixer(fieldPrefix);
  const n = parseInt(blank.id.slice(1), 10);
  const title = isOrphan ? `Blank {${n}} — not in stem` : `Blank ${displayNumber ?? n}`;
  const choiceCounter = `${blank.choices.length} choice${blank.choices.length === 1 ? '' : 's'}`;
  const counterClass =
    blank.choices.length < CLOZE_MIN_CHOICES ? 'warn'
    : blank.choices.length > CLOZE_MAX_CHOICES ? 'err'
    : 'ok';

  return (
    <div className={`bank-cz-blank-card ${isOrphan ? 'orphan' : ''}`}>
      <div className="bank-cz-blank-head">
        <div className="bank-cz-blank-title">
          {!isOrphan && (
            <span className="bank-cz-blank-number">{displayNumber ?? n}</span>
          )}
          <span className="bank-cz-blank-name">{title}</span>
          {isOrphan && (
            <span className="bank-cz-orphan-badge">will be dropped on save</span>
          )}
        </div>
        <span className={`bank-cz-blank-counter ${counterClass}`}>{choiceCounter}</span>
      </div>

      {isOrphan && (
        <p className="bank-cz-orphan-tip">
          Re-type <code>{`{${n}}`}</code> in the stem to reconnect this card.
          Otherwise its choices are discarded when the question is saved.
        </p>
      )}

      <div className="bank-cz-blank-body">
        {blank.choices.map((c) => (
          <div
            key={c.id}
            className={`bank-cz-choice ${c.id === blank.correct_id ? 'correct' : ''}`}
          >
            <div className="bank-cz-choice-correct">
              <input
                type="radio"
                name={fn(`cloze_correct_radio_${blank.id}`)}
                checked={c.id === blank.correct_id}
                onChange={() => onCorrect(c.id)}
                title="Mark as correct"
              />
            </div>
            <div className="bank-cz-choice-fields">
              <input
                type="text"
                value={c.text}
                onChange={(e) => onChoiceText(c.id, e.target.value)}
                placeholder="Choice text (what the student picks)…"
              />
              <input
                type="text"
                className="feedback"
                value={c.feedback}
                onChange={(e) => onChoiceFeedback(c.id, e.target.value)}
                placeholder="Per-choice feedback (optional)…"
              />
            </div>
            <button
              type="button"
              className="bank-row-remove"
              onClick={() => onRemoveChoice(c.id)}
              disabled={blank.choices.length <= CLOZE_MIN_CHOICES}
              title="Remove choice"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="bank-cz-blank-add">
          <button
            type="button"
            className="bank-link-btn"
            onClick={onAddChoice}
            disabled={blank.choices.length >= CLOZE_MAX_CHOICES}
          >
            + Add choice
          </button>
        </div>
      </div>
    </div>
  );
}

function HiddenSerialisers({ blanks, fieldPrefix }: { blanks: BlankRow[]; fieldPrefix: string }) {
  const fn = makePrefixer(fieldPrefix);
  return (
    <>
      {blanks.map((b) => (
        <Fragment key={`hid-${b.id}`}>
          <input type="hidden" name={fn('cloze_blank_id')} value={b.id} />
          <input type="hidden" name={fn('cloze_blank_in_stem')} value={String(b.in_stem)} />
          <input type="hidden" name={fn(`cloze_correct_${b.id}`)} value={b.correct_id} />
          {b.choices.map((c) => (
            <Fragment key={`hid-${b.id}-${c.id}`}>
              <input type="hidden" name={fn(`cloze_choice_id_${b.id}`)} value={c.id} />
              <input type="hidden" name={fn(`cloze_choice_text_${b.id}`)} value={c.text} />
              <input type="hidden" name={fn(`cloze_choice_feedback_${b.id}`)} value={c.feedback} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function defaultBlanks(): BlankRow[] {
  return Array.from({ length: CLOZE_MIN_BLANKS }, (_, i) => ({
    id: `b${i + 1}`,
    choices: [
      { id: 'c1', text: '', feedback: '' },
      { id: 'c2', text: '', feedback: '' },
    ],
    correct_id: 'c1',
    in_stem: true,
  }));
}
