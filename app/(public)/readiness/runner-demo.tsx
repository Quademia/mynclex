'use client';

// mynclex/app/(public)/readiness/runner-demo.tsx
//
// "Inside the exam" — a playable miniature of the real runner, so a visitor
// can feel the NGN item types and the after-sitting review mode before they
// buy. Three types (SATA / Matrix / Highlight) and an Answering↔Review
// toggle; it auto-rotates the type every 6s until the visitor touches it.
//
// SAMPLE ONLY. The questions, answers and rationales are invented teaching
// content, not bank items; nothing here queries or writes. It mirrors the
// look of lib/practice/runner, deliberately, but shares no code with it.

import { useEffect, useState } from 'react';

type RnType = 'sata' | 'matrix' | 'highlight';

const QTYPE_PILLS = [
  'Multiple choice', 'True / False', 'Select all that apply', 'Select N', 'Matrix',
  'Matrix multiple response', 'Cloze', 'Highlight', 'Drag-and-drop cloze',
  'Drag-and-drop order', 'Bow-tie',
];

const TYPE_TABS: { k: RnType; label: string }[] = [
  { k: 'sata', label: 'Select all that apply' },
  { k: 'matrix', label: 'Matrix' },
  { k: 'highlight', label: 'Highlight' },
];

const SATA = [
  { id: 'A', text: 'Blood noted in the urine', correct: true, fb: 'Hematuria signals over-anticoagulation — report immediately.' },
  { id: 'B', text: 'aPTT of 110 seconds', correct: true, fb: 'Well above the 46–70s therapeutic range — the infusion needs adjusting.' },
  { id: 'C', text: 'Heart rate 78/min', correct: false, fb: 'A resting rate of 78/min is within the expected range.' },
  { id: 'D', text: 'Gums bleed with brushing', correct: true, fb: 'Mucosal bleeding is an early sign of excessive anticoagulation.' },
  { id: 'E', text: 'Potassium 4.1 mEq/L', correct: false, fb: 'Normal potassium — heparin does not commonly disturb it acutely.' },
];
const SATA_STUDENT = ['A', 'B', 'C'];

const MATRIX = [
  { id: 'r1', label: 'Respiratory rate 18/min', correct: 'c1', fb: 'A rate of 12–20/min is expected in a resting adult.' },
  { id: 'r2', label: 'O₂ saturation 89% on room air', correct: 'c2', fb: 'Below 95% warrants follow-up — assess and titrate oxygen.' },
  { id: 'r3', label: 'New tracheal deviation', correct: 'c2', fb: 'A late, emergent sign of tension pneumothorax — escalate now.' },
];
const MATRIX_STUDENT: Record<string, string> = { r1: 'c1', r2: 'c1', r3: 'c2' };

const HL_SEGS: { t: string; chunk?: string; correct?: boolean }[] = [
  { t: 'Nurses’ note, 0700: Client is 2 days post-op abdominal surgery. ' },
  { t: 'Reports pain 3/10, controlled with scheduled analgesia', chunk: 'h1', correct: false },
  { t: '. Vital signs: T ' },
  { t: '38.9 °C', chunk: 'h2', correct: true },
  { t: ', HR 92, BP 118/74. Incision edges approximated; ' },
  { t: 'purulent drainage noted at the distal end', chunk: 'h3', correct: true },
  { t: '. Ambulated in hall with steady gait. ' },
  { t: 'Bowel sounds present in all four quadrants', chunk: 'h4', correct: false },
  { t: '.' },
];
const HL_STUDENT = ['h2', 'h4'];

const RN: Record<RnType, { label: string; stem: string; instruction: string; score: string; rationale: string }> = {
  sata: {
    label: 'Select all that apply',
    stem: 'A nurse is caring for a client receiving a continuous IV heparin infusion. Which of the following findings require immediate follow-up?',
    instruction: 'Select all that apply.',
    score: '1 / 3',
    rationale: 'Hematuria, an aPTT of 110 seconds and gum bleeding all point to over-anticoagulation and require immediate follow-up. Answer points: +1 for each correct answer found, −1 for each wrong pick — you found 2 and picked 1 distractor.',
  },
  matrix: {
    label: 'Matrix',
    stem: 'A nurse assesses a client 1 hour after chest-tube insertion. For each finding, specify whether it is anticipated or requires follow-up.',
    instruction: 'Each row requires one selection.',
    score: '2 / 3',
    rationale: 'An O₂ saturation of 89% on room air is below the acceptable threshold and requires follow-up — assess the system and titrate oxygen. Tracheal deviation is emergent. A respiratory rate of 18/min is expected.',
  },
  highlight: {
    label: 'Highlight',
    stem: 'A nurse reviews the note below for a client 2 days post-op.',
    instruction: 'Click to highlight the findings that require immediate follow-up.',
    score: '1 / 2',
    rationale: 'The fever (38.9 °C) and purulent drainage together indicate a developing surgical-site infection — you highlighted the fever but missed the drainage, and normal bowel sounds were a distractor.',
  },
};

export function RunnerDemo() {
  const [type, setType] = useState<RnType>('sata');
  const [review, setReview] = useState(false);
  const [auto, setAuto] = useState(true);
  const [sataPicks, setSataPicks] = useState<string[]>([]);
  const [matrixPicks, setMatrixPicks] = useState<Record<string, string>>({});
  const [hlPicks, setHlPicks] = useState<string[]>([]);

  useEffect(() => {
    if (!auto) return;
    const order: RnType[] = ['sata', 'matrix', 'highlight'];
    const t = setInterval(() => {
      setType((cur) => order[(order.indexOf(cur) + 1) % order.length]);
    }, 6000);
    return () => clearInterval(t);
  }, [auto]);

  const stop = () => setAuto(false);
  const rn = RN[type];

  return (
    <section className="rpc-runner-sec">
      <div className="rpc-runner-glow" />
      <div className="rpc-inner rpc-runner-inner">
        <div className="rpc-runner-intro rpc-reveal">
          <div className="rpc-eyebrow on-dark">Inside the exam</div>
          <h2>
            Every NGN question type — <span className="rpc-serif">sat, then reviewed</span>
          </h2>
          <p>
            The same runner as the real bank: the full Next-Gen NCLEX item mix, and for 21 days
            after your sitting a review mode that shows your pick, the correct answer and the
            rationale on every question. Try it — answer, then flip to review.
          </p>
          <div className="rpc-qpills">
            {QTYPE_PILLS.map((q) => (
              <span key={q} className="rpc-qpill">{q}</span>
            ))}
          </div>
        </div>

        <div className="rpc-runner-controls rpc-reveal">
          <div className="rpc-tabs">
            {TYPE_TABS.map((t) => (
              <button
                key={t.k}
                type="button"
                className={`rpc-dtab${type === t.k ? ' on' : ''}`}
                onClick={() => { setType(t.k); stop(); }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="rpc-mode">
            <button type="button" className={!review ? 'on' : ''} onClick={() => { setReview(false); stop(); }}>Answering</button>
            <button type="button" className={review ? 'on' : ''} onClick={() => { setReview(true); stop(); }}>Review mode</button>
          </div>
        </div>

        <div className="rpc-frame rpc-reveal">
          <div className="rpc-frame-top">
            <span className="rpc-frame-tag">← Exit</span>
            <span className="rpc-frame-div" />
            <span className="rpc-frame-title">
              <span className="t">Readiness Pack 2</span>
              <span className="s">timed · one shot</span>
            </span>
            <span className="rpc-frame-spacer" />
            <span className="rpc-frame-qn">Question <strong>14 / 100</strong></span>
            <span className="rpc-frame-clock">2:41:07 <span className="u">left</span></span>
            <span className="rpc-frame-tag">⚑ Mark for review</span>
          </div>

          <div className="rpc-frame-body">
            <div className="rpc-q-tags">
              <span className="rpc-q-tag">{rn.label}</span>
              <span className="rpc-q-tag cat">Pharmacological Therapies</span>
            </div>
            <div className="rpc-q-stem">{rn.stem}</div>
            <div className="rpc-q-instr">{rn.instruction}</div>

            {type === 'sata' && <SataInput review={review} picks={sataPicks} setPicks={setSataPicks} stop={stop} />}
            {type === 'matrix' && <MatrixInput review={review} picks={matrixPicks} setPicks={setMatrixPicks} stop={stop} />}
            {type === 'highlight' && <HighlightInput review={review} picks={hlPicks} setPicks={setHlPicks} stop={stop} />}

            {review ? (
              <div className="rpc-rationale">
                <div className="rpc-rationale-head">
                  <span className="lbl">Rationale · review</span>
                  <span className="sc">{rn.score} points</span>
                </div>
                <div className="rpc-rationale-body">{rn.rationale}</div>
              </div>
            ) : (
              <div className="rpc-runner-hint">
                In your real sitting, answers save as you go — and every question gets a block like
                this in review mode, for 21 days.
              </div>
            )}
          </div>

          <div className="rpc-frame-bot">
            <span className="btn">◀ Previous</span>
            <span className="mid">Changed answers are logged — your report shows your second-guessing.</span>
            <span className="btn next">Next ▶</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SataInput({
  review, picks, setPicks, stop,
}: { review: boolean; picks: string[]; setPicks: (p: string[]) => void; stop: () => void }) {
  return (
    <div className="rpc-opts">
      {SATA.map((o) => {
        const picked = review ? SATA_STUDENT.includes(o.id) : picks.includes(o.id);
        let state = '';
        if (review) {
          if (o.correct && picked) state = 'right';
          else if (!o.correct && picked) state = 'wrong';
          else if (o.correct && !picked) state = 'missed';
          else state = 'dim';
        } else if (picked) state = 'sel';
        const verdict = review
          ? state === 'right' ? '✓ Correct' : state === 'wrong' ? '✕ Wrong pick' : state === 'missed' ? '⚠ Missed' : ''
          : '';
        return (
          <button
            key={o.id}
            type="button"
            className={`rpc-opt ${state}${review ? '' : ' click'}`}
            disabled={review}
            onClick={review ? undefined : () => {
              setPicks(picks.includes(o.id) ? picks.filter((x) => x !== o.id) : [...picks, o.id]);
              stop();
            }}
          >
            <span className="rpc-opt-letter">{state && state !== 'dim' ? o.id : `${o.id}.`}</span>
            <span className="rpc-opt-body">
              <span>{o.text}</span>
              {review && <span className="rpc-opt-fb">{o.fb}</span>}
            </span>
            {verdict && <span className={`rpc-opt-verdict ${state}`}>{verdict}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MatrixInput({
  review, picks, setPicks, stop,
}: { review: boolean; picks: Record<string, string>; setPicks: (p: Record<string, string>) => void; stop: () => void }) {
  const cellClass = (rowId: string, col: string, correct: string) => {
    const picked = (review ? MATRIX_STUDENT : picks)[rowId] === col;
    const isCorrect = correct === col;
    if (review) {
      if (isCorrect && picked) return { cls: 'right', glyph: '●' };
      if (!isCorrect && picked) return { cls: 'wrong', glyph: '●' };
      if (isCorrect && !picked) return { cls: 'missed', glyph: '✓' };
      return { cls: '', glyph: '○' };
    }
    return picked ? { cls: 'sel', glyph: '●' } : { cls: '', glyph: '○' };
  };
  return (
    <div className="rpc-matrix">
      <div className="rpc-matrix-head">
        <div>Assessment finding</div>
        <div className="c">Anticipated</div>
        <div className="c">Requires follow-up</div>
      </div>
      {MATRIX.map((row) => {
        const c1 = cellClass(row.id, 'c1', row.correct);
        const c2 = cellClass(row.id, 'c2', row.correct);
        return (
          <div key={row.id} className="rpc-matrix-row">
            <div className="rpc-matrix-cells">
              <div className="rpc-matrix-lbl">{row.label}</div>
              <button
                type="button" className={`rpc-matrix-cell ${c1.cls}${review ? '' : ' click'}`} disabled={review}
                onClick={review ? undefined : () => { setPicks({ ...picks, [row.id]: 'c1' }); stop(); }}
              >{c1.glyph}</button>
              <button
                type="button" className={`rpc-matrix-cell ${c2.cls}${review ? '' : ' click'}`} disabled={review}
                onClick={review ? undefined : () => { setPicks({ ...picks, [row.id]: 'c2' }); stop(); }}
              >{c2.glyph}</button>
            </div>
            {review && <div className="rpc-matrix-foot">{row.fb}</div>}
          </div>
        );
      })}
    </div>
  );
}

function HighlightInput({
  review, picks, setPicks, stop,
}: { review: boolean; picks: string[]; setPicks: (p: string[]) => void; stop: () => void }) {
  const now = review ? HL_STUDENT : picks;
  return (
    <p className="rpc-hl">
      {HL_SEGS.map((seg, i) => {
        if (!seg.chunk) return <span key={i}>{seg.t}</span>;
        const picked = now.includes(seg.chunk);
        let cls = '';
        if (review) {
          if (seg.correct && picked) cls = 'right';
          else if (!seg.correct && picked) cls = 'wrong';
          else if (seg.correct && !picked) cls = 'missed';
        } else if (picked) cls = 'pick';
        const chunk = seg.chunk;
        return (
          <button
            key={i}
            type="button"
            className={cls}
            disabled={review}
            onClick={review ? undefined : () => {
              setPicks(picks.includes(chunk) ? picks.filter((x) => x !== chunk) : [...picks, chunk]);
              stop();
            }}
          >
            {seg.t}
          </button>
        );
      })}
    </p>
  );
}
