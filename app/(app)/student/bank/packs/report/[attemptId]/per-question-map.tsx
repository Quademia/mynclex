'use client';

// mynclex/app/(app)/student/bank/packs/report/[attemptId]/per-question-map.tsx
//
// "Per-question map" (§11.5, Slice ⑤) — 100 outcome-coloured cells you can
// filter (outcome / category / difficulty), regroup (sitting order / category
// / difficulty), and tap for per-question detail. A second-guessing panel
// reads answer_changes_json (revisions + their net direction); changed cells
// carry a white dot. The per-cell "Open in review" is window-gated.
//
// Time bits are live (Slice ② of the time engine): a "Time spent" row in the
// detail (with a "· rushed" tag) and a "Rushed" outcome filter, both reading
// ReportItem.timeSpentSec / .rushed.
//
// Responsive: the detail sits in a side panel on desktop; on mobile it
// injects full-width directly under the tapped cell's row (CSS toggles which
// copy shows). Second-guessing likewise renders in the side panel (desktop)
// and below the grid (mobile).

import { Fragment, useState } from 'react';
import type { ReportItem } from '@/lib/payments/readiness-report';
import { DIFFICULTY_LEVELS } from '@/lib/bank/classifications';
import { formatSecsWords } from '@/lib/payments/readiness-pacing';

type Outcome = 'full' | 'partial' | 'wrong';
type OutcomeFilter = 'all' | Outcome | 'changed' | 'rushed';

function outcomeOf(it: ReportItem): Outcome {
  return it.isCorrect ? 'full' : it.scoreAwarded > 0 ? 'partial' : 'wrong';
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  full: 'Correct',
  partial: 'Partially correct',
  wrong: 'Wrong or skipped',
};

const QTYPE_LABEL: Record<string, string> = {
  MCQ: 'Multiple choice',
  TF: 'True / False',
  SATA: 'Select all that apply',
  SELECT_N: 'Select N',
  MATRIX: 'Matrix',
  MATRIX_MR: 'Matrix multiple response',
  CLOZE: 'Cloze',
  HIGHLIGHT: 'Highlight',
  DRAG_CLOZE: 'Drag-and-drop cloze',
  DRAG_ORDER: 'Drag-and-drop order',
  BOWTIE: 'Bow-tie',
};

const DIR_LABEL: Record<NonNullable<ReportItem['changeDir']>, string> = {
  rightToWrong: 'right → wrong',
  wrongToRight: 'wrong → right',
  other: 'no change in outcome',
};

interface Cell {
  idx: number;
  num: number;
  outcome: Outcome;
  it: ReportItem;
}

function DetailCard({
  cell,
  reviewOpen,
  attemptId,
}: {
  cell: Cell;
  reviewOpen: boolean;
  attemptId: string;
}) {
  const it = cell.it;
  return (
    <div className="rs-map-detail">
      <div className="rs-map-detail-head">
        <span className="rs-map-detail-q">Question {cell.num}</span>
        <span className={`rs-map-pill rs-map-pill-${cell.outcome}`}>{OUTCOME_LABEL[cell.outcome]}</span>
      </div>
      <div className="rs-map-detail-rows">
        <div><span>Type</span><span>{QTYPE_LABEL[it.questionType] ?? it.questionType}</span></div>
        <div><span>Category</span><span>{it.subcategory ?? it.category ?? '—'}</span></div>
        <div><span>Body system</span><span>{it.bodySystem ?? '—'}</span></div>
        <div><span>Difficulty</span><span>{it.difficulty ?? '—'}</span></div>
        <div><span>You earned</span><span>{it.scoreAwarded} of {it.marks}</span></div>
        <div>
          <span>Time spent</span>
          <span>
            {it.timeSpentSec != null
              ? `${formatSecsWords(it.timeSpentSec)}${it.rushed ? ' · rushed' : ''}`
              : '—'}
          </span>
        </div>
        <div>
          <span>Answer changes</span>
          <span>{it.changed && it.changeDir ? `1 · ${DIR_LABEL[it.changeDir]}` : 'None'}</span>
        </div>
      </div>
      {reviewOpen ? (
        <a className="rs-btn rs-btn-navy rs-map-review" href={`/session/${attemptId}`}>
          Open in review →
        </a>
      ) : (
        <div className="rs-map-sealed">
          Question review closed — the outcome stays, the question itself is sealed.
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="rs-map-legend">
      <div className="rs-map-legend-keys">
        <span><span className="rs-map-key rs-cell-full" />Correct</span>
        <span><span className="rs-map-key rs-cell-partial" />Partial</span>
        <span><span className="rs-map-key rs-cell-wrong" />Wrong</span>
      </div>
      <p>Select a question to see its type, category, difficulty and the credit you earned.</p>
    </div>
  );
}

function SecondGuessing({
  changed,
  r2w,
  w2r,
  other,
  active,
  onShow,
}: {
  changed: number;
  r2w: number;
  w2r: number;
  other: number;
  active: boolean;
  onShow: () => void;
}) {
  return (
    <div className="rs-map-sg">
      <div className="rs-map-sg-h">Second-guessing</div>
      {changed > 0 ? (
        <>
          <p>
            You changed your answer on <strong>{changed}</strong> question{changed === 1 ? '' : 's'}:{' '}
            <strong>{r2w}</strong> right→wrong, <strong>{w2r}</strong> wrong→right
            {other > 0 ? `, ${other} no outcome change` : ''}.
          </p>
          <button type="button" className="rs-map-sg-btn" onClick={onShow}>
            {active ? 'Showing changed cells' : 'Show them on the map'}
          </button>
          <p className="rs-map-sg-note">
            Changed cells carry a white dot. Directions only — the correct answers stay sealed
            outside your review window.
          </p>
        </>
      ) : (
        <p className="rs-map-sg-empty">You didn&rsquo;t revise any answers on this sitting.</p>
      )}
    </div>
  );
}

export default function PerQuestionMap({
  items,
  reviewOpen,
  attemptId,
}: {
  items: ReportItem[];
  reviewOpen: boolean;
  attemptId: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [cat, setCat] = useState('all');
  const [diff, setDiff] = useState('all');
  const [group, setGroup] = useState<'order' | 'category' | 'difficulty'>('order');

  const cells: Cell[] = items.map((it, idx) => ({ idx, num: idx + 1, outcome: outcomeOf(it), it }));

  const cFull = cells.filter((c) => c.outcome === 'full').length;
  const cPartial = cells.filter((c) => c.outcome === 'partial').length;
  const cWrong = cells.filter((c) => c.outcome === 'wrong').length;
  const cChanged = cells.filter((c) => c.it.changed).length;
  const cRushed = cells.filter((c) => c.it.rushed).length;
  const r2w = cells.filter((c) => c.it.changeDir === 'rightToWrong').length;
  const w2r = cells.filter((c) => c.it.changeDir === 'wrongToRight').length;
  const other = cChanged - r2w - w2r;

  const shown = cells.filter(
    (c) =>
      (outcome === 'all' ||
        (outcome === 'changed'
          ? c.it.changed
          : outcome === 'rushed'
            ? c.it.rushed
            : c.outcome === outcome)) &&
      (cat === 'all' || c.it.category === cat) &&
      (diff === 'all' || c.it.difficulty === diff),
  );

  const catOptions = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];
  let groups: { label: string | null; cells: Cell[] }[];
  if (group === 'category') {
    groups = catOptions
      .map((nm) => ({ label: nm, cells: shown.filter((c) => c.it.category === nm) }))
      .filter((g) => g.cells.length > 0);
  } else if (group === 'difficulty') {
    // DIFFICULTY_LEVELS, not a hardcoded three — since 10a there are five
    // bands, and the literal list here silently dropped every Very easy /
    // Very hard question from this grouping.
    groups = [...DIFFICULTY_LEVELS]
      .map((nm) => ({ label: nm, cells: shown.filter((c) => c.it.difficulty === nm) }))
      .filter((g) => g.cells.length > 0);
  } else {
    groups = [{ label: null, cells: shown }];
  }

  const selCell = sel != null ? cells[sel] : null;

  const showChips: { k: OutcomeFilter; label: string }[] = [
    { k: 'all', label: `All · ${cells.length}` },
    { k: 'full', label: `Correct · ${cFull}` },
    { k: 'partial', label: `Partial · ${cPartial}` },
    { k: 'wrong', label: `Wrong · ${cWrong}` },
    { k: 'rushed', label: `Rushed · ${cRushed}` },
    { k: 'changed', label: `Changed · ${cChanged}` },
  ];
  const groupChips: { k: typeof group; label: string }[] = [
    { k: 'order', label: 'Sitting order' },
    { k: 'category', label: 'Category' },
    { k: 'difficulty', label: 'Difficulty' },
  ];

  return (
    <div className="rs-map">
      <p className="rs-map-sub">
        All {items.length} questions — filter by outcome, category or difficulty, regroup to spot
        patterns, and tap any cell.
      </p>

      <div className="rs-map-chiprow">
        <span className="rs-map-chiplabel">SHOW</span>
        {showChips.map((ch) => (
          <button
            key={ch.k}
            type="button"
            className={`rs-map-chip${outcome === ch.k ? ' is-active' : ''}`}
            onClick={() => setOutcome(ch.k)}
          >
            {ch.label}
          </button>
        ))}
      </div>

      <div className="rs-map-chiprow">
        <span className="rs-map-chiplabel">GROUP</span>
        {groupChips.map((gc) => (
          <button
            key={gc.k}
            type="button"
            className={`rs-map-chip${group === gc.k ? ' is-active' : ''}`}
            onClick={() => setGroup(gc.k)}
          >
            {gc.label}
          </button>
        ))}
        <select className="rs-map-select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {catOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select className="rs-map-select" value={diff} onChange={(e) => setDiff(e.target.value)}>
          <option value="all">All difficulties</option>
          {DIFFICULTY_LEVELS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="rs-map-shown">
          Showing {shown.length} of {items.length}
        </span>
      </div>

      <div className="rs-map-body">
        <div className="rs-map-gridcol">
          {groups.map((g, gi) => {
            const selLocal = selCell ? g.cells.findIndex((c) => c.idx === selCell.idx) : -1;
            const rowEnd = selLocal >= 0 ? Math.min(g.cells.length - 1, Math.floor(selLocal / 10) * 10 + 9) : -1;
            return (
              <div key={gi} className="rs-map-group">
                {g.label && <div className="rs-map-grouplabel">{g.label}</div>}
                <div className="rs-map-grid">
                  {g.cells.map((c, li) => (
                    <Fragment key={c.idx}>
                      <button
                        type="button"
                        className={`rs-map-cell rs-cell-${c.outcome}${sel === c.idx ? ' is-sel' : ''}`}
                        onClick={() => setSel(sel === c.idx ? null : c.idx)}
                        title={`Q${c.num}`}
                      >
                        {c.num}
                        {c.it.changed && <span className="rs-map-dot" />}
                      </button>
                      {li === rowEnd && selCell && (
                        <div className="rs-map-inline">
                          <DetailCard cell={selCell} reviewOpen={reviewOpen} attemptId={attemptId} />
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <p className="rs-map-none">No questions match these filters.</p>}

          {/* second-guessing — mobile copy, below the grid */}
          <div className="rs-map-sg-mobile">
            <SecondGuessing
              changed={cChanged}
              r2w={r2w}
              w2r={w2r}
              other={other}
              active={outcome === 'changed'}
              onShow={() => setOutcome('changed')}
            />
          </div>
        </div>

        {/* side panel — desktop */}
        <div className="rs-map-side">
          {selCell ? (
            <DetailCard cell={selCell} reviewOpen={reviewOpen} attemptId={attemptId} />
          ) : (
            <Legend />
          )}
          <SecondGuessing
            changed={cChanged}
            r2w={r2w}
            w2r={w2r}
            other={other}
            active={outcome === 'changed'}
            onShow={() => setOutcome('changed')}
          />
        </div>
      </div>
    </div>
  );
}
