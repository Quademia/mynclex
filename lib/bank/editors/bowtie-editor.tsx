// mynclex/lib/bank/editors/bowtie-editor.tsx
//
// Bow-tie authoring UI. Three wings (left/centre/right), each with its
// own label, own tokens, own correct selection.
//
// UX: top-of-panel live answer-key preview + tab bar to switch wings +
// only the active wing's editor panel is visible below.
//
// FormData contract (hidden inputs carry everything):
//   bowtie_left_label / bowtie_centre_label / bowtie_right_label
//   bowtie_{wing}_token_id         (one per token in that wing)
//   bowtie_{wing}_token_text       (parallel)
//   bowtie_{wing}_token_feedback   (parallel)
//   bowtie_left_correct            (zero, one, or more checkbox values)
//   bowtie_centre_correct          (single radio value)
//   bowtie_right_correct           (zero, one, or more checkbox values)

'use client';

import { Fragment, useState } from 'react';
import {
  BT_LEFT_CORRECT,
  BT_CENTRE_CORRECT,
  BT_RIGHT_CORRECT,
  BT_WING_MAX_TOKENS,
  BT_LEFT_PRESETS,
  BT_CENTRE_PRESETS,
  BT_RIGHT_PRESETS,
} from '../classifications';

type WingKey = 'left' | 'centre' | 'right';

interface TokenRow {
  id: string;
  text: string;
  feedback: string;
  correct: boolean;
}

export function BowtieEditor({
  initialLeftLabel,
  initialLeftTokens,
  initialCentreLabel,
  initialCentreTokens,
  initialRightLabel,
  initialRightTokens,
}: {
  initialLeftLabel: string;
  initialLeftTokens: TokenRow[];
  initialCentreLabel: string;
  initialCentreTokens: TokenRow[];
  initialRightLabel: string;
  initialRightTokens: TokenRow[];
}) {
  const [activeTab, setActiveTab] = useState<WingKey>('left');

  const [leftLabel, setLeftLabel]   = useState<string>(initialLeftLabel || 'Actions to take');
  const [centreLabel, setCentreLabel] = useState<string>(initialCentreLabel || 'Condition');
  const [rightLabel, setRightLabel] = useState<string>(initialRightLabel || 'Parameters to monitor');

  const [leftTokens, setLeftTokens]     = useState<TokenRow[]>(() => initialLeftTokens.length > 0 ? initialLeftTokens : defaultTokens('l', 3));
  const [centreTokens, setCentreTokens] = useState<TokenRow[]>(() => initialCentreTokens.length > 0 ? initialCentreTokens : defaultTokens('c', 2));
  const [rightTokens, setRightTokens]   = useState<TokenRow[]>(() => initialRightTokens.length > 0 ? initialRightTokens : defaultTokens('r', 3));

  // Wing validity for status dots
  const leftValid   = validWing(leftTokens,   BT_LEFT_CORRECT);
  const centreValid = validWing(centreTokens, BT_CENTRE_CORRECT);
  const rightValid  = validWing(rightTokens,  BT_RIGHT_CORRECT);

  return (
    <div className="bank-fg">
      <div className="bank-label-row">
        <label className="bank-label">Bow-tie wings *</label>
      </div>
      <p className="bank-hint">
        Click a tab to edit that wing. Green dot = correctly filled;
        amber = missing a correct pick; red = too many or no tokens yet.
      </p>

      {/* Answer-key preview */}
      <BowtiePreview
        leftLabel={leftLabel}
        leftTokens={leftTokens}
        centreLabel={centreLabel}
        centreTokens={centreTokens}
        rightLabel={rightLabel}
        rightTokens={rightTokens}
      />

      {/* Tab bar */}
      <div className="bt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'left'}
          className={`bt-tab left ${activeTab === 'left' ? 'active' : ''}`}
          onClick={() => setActiveTab('left')}
        >
          <span className={`bt-tab-dot ${dotClass(leftValid)}`}></span>
          Left wing — {leftLabel || '(no label)'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'centre'}
          className={`bt-tab centre ${activeTab === 'centre' ? 'active' : ''}`}
          onClick={() => setActiveTab('centre')}
        >
          <span className={`bt-tab-dot ${dotClass(centreValid)}`}></span>
          Centre — {centreLabel || '(no label)'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'right'}
          className={`bt-tab right ${activeTab === 'right' ? 'active' : ''}`}
          onClick={() => setActiveTab('right')}
        >
          <span className={`bt-tab-dot ${dotClass(rightValid)}`}></span>
          Right wing — {rightLabel || '(no label)'}
        </button>
      </div>

      <div className="bt-wings-wrap">

        <WingPanel
          wingKey="left"
          active={activeTab === 'left'}
          title="Left wing"
          subtitle={`Exactly ${BT_LEFT_CORRECT} correct · unlimited distractors up to ${BT_WING_MAX_TOKENS}`}
          presets={BT_LEFT_PRESETS}
          requiredCorrect={BT_LEFT_CORRECT}
          label={leftLabel}
          setLabel={setLeftLabel}
          tokens={leftTokens}
          setTokens={setLeftTokens}
          useRadio={false}
        />

        <WingPanel
          wingKey="centre"
          active={activeTab === 'centre'}
          title="Centre"
          subtitle={`Exactly ${BT_CENTRE_CORRECT} correct · unlimited distractors up to ${BT_WING_MAX_TOKENS}`}
          presets={BT_CENTRE_PRESETS}
          requiredCorrect={BT_CENTRE_CORRECT}
          label={centreLabel}
          setLabel={setCentreLabel}
          tokens={centreTokens}
          setTokens={setCentreTokens}
          useRadio={true}
        />

        <WingPanel
          wingKey="right"
          active={activeTab === 'right'}
          title="Right wing"
          subtitle={`Exactly ${BT_RIGHT_CORRECT} correct · unlimited distractors up to ${BT_WING_MAX_TOKENS}`}
          presets={BT_RIGHT_PRESETS}
          requiredCorrect={BT_RIGHT_CORRECT}
          label={rightLabel}
          setLabel={setRightLabel}
          tokens={rightTokens}
          setTokens={setRightTokens}
          useRadio={false}
        />
      </div>

      {/* Hidden inputs carry all three wings into FormData. Rendered
          outside the tab panels so inactive wings' data isn't lost. */}
      <HiddenSerialisers
        leftLabel={leftLabel} leftTokens={leftTokens}
        centreLabel={centreLabel} centreTokens={centreTokens}
        rightLabel={rightLabel} rightTokens={rightTokens}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function WingPanel({
  wingKey, active, title, subtitle, presets, requiredCorrect,
  label, setLabel, tokens, setTokens, useRadio,
}: {
  wingKey: WingKey;
  active: boolean;
  title: string;
  subtitle: string;
  presets: readonly string[];
  requiredCorrect: number;
  label: string;
  setLabel: (s: string) => void;
  tokens: TokenRow[];
  setTokens: (next: TokenRow[]) => void;
  useRadio: boolean;
}) {
  if (!active) return null;

  const tokenIdPrefix = wingKey === 'left' ? 'lt' : wingKey === 'centre' ? 'ct' : 'rt';

  function nextId(): string {
    const used = new Set(tokens.map((t) => t.id));
    let n = 1;
    while (used.has(`${tokenIdPrefix}${n}`)) n++;
    return `${tokenIdPrefix}${n}`;
  }

  function addToken() {
    if (tokens.length >= BT_WING_MAX_TOKENS) return;
    setTokens([...tokens, { id: nextId(), text: '', feedback: '', correct: false }]);
  }

  function removeToken(idx: number) {
    if (tokens.length <= requiredCorrect) return;
    setTokens(tokens.filter((_, i) => i !== idx));
  }

  function updateText(idx: number, text: string) {
    setTokens(tokens.map((t, i) => i === idx ? { ...t, text } : t));
  }

  function updateFeedback(idx: number, feedback: string) {
    setTokens(tokens.map((t, i) => i === idx ? { ...t, feedback } : t));
  }

  function toggleCorrect(idx: number) {
    if (useRadio) {
      // Radio semantics: picking one clears all others
      setTokens(tokens.map((t, i) => ({ ...t, correct: i === idx })));
    } else {
      // Checkbox semantics: soft cap — if already at requiredCorrect,
      // and user ticks a new one, un-tick the oldest ticked.
      const picked = tokens.filter((t) => t.correct);
      if (!tokens[idx].correct && picked.length >= requiredCorrect) {
        // Auto-unpick the first currently-picked one
        const firstPickedIdx = tokens.findIndex((t) => t.correct);
        setTokens(tokens.map((t, i) => {
          if (i === firstPickedIdx) return { ...t, correct: false };
          if (i === idx) return { ...t, correct: true };
          return t;
        }));
      } else {
        setTokens(tokens.map((t, i) => i === idx ? { ...t, correct: !t.correct } : t));
      }
    }
  }

  const correctCount = tokens.filter((t) => t.correct).length;
  const counterClass =
    correctCount === requiredCorrect ? 'ok' :
    correctCount < requiredCorrect  ? 'warn' : 'err';
  const counterText = `${correctCount} of ${requiredCorrect}${correctCount === requiredCorrect ? ' ✓' : ''}`;

  return (
    <div className={`bt-wing-card ${wingKey}`}>
      <div className="bt-wing-head">
        <div className="bt-wing-title">
          <div className="bt-wing-title-label">{title}</div>
          <div className="bt-wing-title-sub">{subtitle}</div>
        </div>

        <div className="bt-wing-label-picker">
          <div className="bt-label-sm">Label shown to student</div>
          <div className="bt-label-picker-row">
            <select
              value={presets.includes(label) ? label : '__custom__'}
              onChange={(e) => {
                if (e.target.value !== '__custom__') setLabel(e.target.value);
              }}
            >
              {presets.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Or type your own…"
            />
          </div>
        </div>

        <div className={`bt-wing-counter ${counterClass}`}>{counterText}</div>
      </div>

      <div className="bt-wing-body">
        {tokens.map((tk, idx) => (
          <div key={tk.id} className="bt-wing-token">
            <div className="bt-wing-token-correct">
              <input
                type={useRadio ? 'radio' : 'checkbox'}
                name={useRadio ? `bt_${wingKey}_correct_radio` : undefined}
                checked={tk.correct}
                onChange={() => toggleCorrect(idx)}
                title="Mark as correct"
              />
            </div>
            <div className="bt-wing-token-fields">
              <input
                type="text"
                value={tk.text}
                onChange={(e) => updateText(idx, e.target.value)}
                placeholder="Token text (what the student sees)…"
              />
              <input
                type="text"
                className="feedback"
                value={tk.feedback}
                onChange={(e) => updateFeedback(idx, e.target.value)}
                placeholder="Per-token feedback (optional)…"
              />
            </div>
            <button
              type="button"
              className="bank-row-remove"
              onClick={() => removeToken(idx)}
              disabled={tokens.length <= requiredCorrect}
              title="Remove token"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="bt-wing-add">
          <button
            type="button"
            className="bank-link-btn"
            onClick={addToken}
            disabled={tokens.length >= BT_WING_MAX_TOKENS}
          >
            + Add token to {title.toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

function BowtiePreview({
  leftLabel, leftTokens,
  centreLabel, centreTokens,
  rightLabel, rightTokens,
}: {
  leftLabel: string; leftTokens: TokenRow[];
  centreLabel: string; centreTokens: TokenRow[];
  rightLabel: string; rightTokens: TokenRow[];
}) {
  const leftCorrect   = leftTokens.filter((t) => t.correct);
  const centreCorrect = centreTokens.filter((t) => t.correct);
  const rightCorrect  = rightTokens.filter((t) => t.correct);

  function chip(label: string, cls: string, key: string) {
    return (
      <div key={key} className={`bt-preview-chip ${cls}`}>
        {label || <em style={{ fontStyle: 'italic' }}>(empty)</em>}
      </div>
    );
  }
  function emptyChip(key: string) {
    return <div key={key} className="bt-preview-chip empty">(not yet picked)</div>;
  }

  return (
    <div className="bt-preview">
      <div className="bt-preview-label">★ Answer-key preview</div>
      <div className="bt-preview-grid">
        <div className="bt-preview-col">
          <div className="bt-preview-col-label">{leftLabel || 'Left wing'}</div>
          {leftCorrect[0] ? chip(leftCorrect[0].text, 'left', 'l0') : emptyChip('l0')}
          {leftCorrect[1] ? chip(leftCorrect[1].text, 'left', 'l1') : emptyChip('l1')}
        </div>
        <div className="bt-preview-col">
          <div className="bt-preview-col-label">{centreLabel || 'Centre'}</div>
          {centreCorrect[0] ? chip(centreCorrect[0].text, 'centre', 'c0') : emptyChip('c0')}
        </div>
        <div className="bt-preview-col">
          <div className="bt-preview-col-label">{rightLabel || 'Right wing'}</div>
          {rightCorrect[0] ? chip(rightCorrect[0].text, 'right', 'r0') : emptyChip('r0')}
          {rightCorrect[1] ? chip(rightCorrect[1].text, 'right', 'r1') : emptyChip('r1')}
        </div>
      </div>
    </div>
  );
}

function HiddenSerialisers({
  leftLabel, leftTokens,
  centreLabel, centreTokens,
  rightLabel, rightTokens,
}: {
  leftLabel: string; leftTokens: TokenRow[];
  centreLabel: string; centreTokens: TokenRow[];
  rightLabel: string; rightTokens: TokenRow[];
}) {
  // Centre uses a single radio value; wings use repeated checkbox values.
  const centreCorrect = centreTokens.find((t) => t.correct)?.id ?? '';

  return (
    <>
      <input type="hidden" name="bowtie_left_label" value={leftLabel} />
      {leftTokens.map((t) => (
        <Fragment key={`lhid-${t.id}`}>
          <input type="hidden" name="bowtie_left_token_id" value={t.id} />
          <input type="hidden" name="bowtie_left_token_text" value={t.text} />
          <input type="hidden" name="bowtie_left_token_feedback" value={t.feedback} />
          {t.correct && <input type="hidden" name="bowtie_left_correct" value={t.id} />}
        </Fragment>
      ))}

      <input type="hidden" name="bowtie_centre_label" value={centreLabel} />
      {centreTokens.map((t) => (
        <Fragment key={`chid-${t.id}`}>
          <input type="hidden" name="bowtie_centre_token_id" value={t.id} />
          <input type="hidden" name="bowtie_centre_token_text" value={t.text} />
          <input type="hidden" name="bowtie_centre_token_feedback" value={t.feedback} />
        </Fragment>
      ))}
      <input type="hidden" name="bowtie_centre_correct" value={centreCorrect} />

      <input type="hidden" name="bowtie_right_label" value={rightLabel} />
      {rightTokens.map((t) => (
        <Fragment key={`rhid-${t.id}`}>
          <input type="hidden" name="bowtie_right_token_id" value={t.id} />
          <input type="hidden" name="bowtie_right_token_text" value={t.text} />
          <input type="hidden" name="bowtie_right_token_feedback" value={t.feedback} />
          {t.correct && <input type="hidden" name="bowtie_right_correct" value={t.id} />}
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function defaultTokens(prefix: 'l' | 'c' | 'r', count: number): TokenRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}t${i + 1}`,
    text: '',
    feedback: '',
    correct: false,
  }));
}

function validWing(tokens: TokenRow[], required: number): 'ok' | 'warn' | 'err' {
  const correctCount = tokens.filter((t) => t.correct).length;
  const filledCount = tokens.filter((t) => t.text.trim()).length;
  if (correctCount === required && filledCount >= required) return 'ok';
  if (correctCount > required || filledCount === 0) return 'err';
  return 'warn';
}

function dotClass(v: 'ok' | 'warn' | 'err'): string {
  return v;
}
