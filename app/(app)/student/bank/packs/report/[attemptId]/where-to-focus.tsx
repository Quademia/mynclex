'use client';

// mynclex/app/(app)/student/bank/packs/report/[attemptId]/where-to-focus.tsx
//
// The "Where to focus" section (§11.5, Slice ②) — a 4-axis remediation map
// with the Client Needs 3-level drill. Pure presentation over the report's
// per-question rows; the maths lives in lib/payments/readiness-breakdowns.ts.
//
// Bucket metric is a count fraction ("X of Y" fully correct) so it's honest
// on thin slices by construction. The "Practise in the bank" deep-link is
// wired in Slice ③ (it links to the builder untargeted for now).

import { useState } from 'react';
import type { ReportItem } from '@/lib/payments/readiness-report';
import {
  axisRows,
  clientNeedsTree,
  type AxisKey,
  type BucketRow,
} from '@/lib/payments/readiness-breakdowns';

const AXES: { k: AxisKey; label: string }[] = [
  { k: 'needs', label: 'Client needs' },
  { k: 'systems', label: 'Body system' },
  { k: 'difficulty', label: 'Difficulty' },
  { k: 'cjmm', label: 'Clinical judgment' },
];

function toneOf(frac: number): 'danger' | 'warn' | 'ok' {
  return frac < 0.6 ? 'danger' : frac < 0.8 ? 'warn' : 'ok';
}

function Bar({ frac }: { frac: number }) {
  return (
    <div className="rs-wtf-bar">
      <div
        className={`rs-wtf-fill rs-wtf-${toneOf(frac)}`}
        style={{ width: `${Math.max(2, Math.round(frac * 100))}%` }}
      />
    </div>
  );
}

function Val({ correct, n }: { correct: number; n: number }) {
  return (
    <span className={`rs-wtf-val rs-wtf-${toneOf(n ? correct / n : 0)}-t`}>
      {correct} of {n}
    </span>
  );
}

function TopicChecklist({ topics, target }: { topics: string[]; target: string }) {
  if (!topics.length) {
    return (
      <div className="rs-wtf-topics">
        <p className="rs-wtf-topics-empty">Nothing flagged here — you got these questions right.</p>
      </div>
    );
  }
  return (
    <div className="rs-wtf-topics">
      <div className="rs-wtf-topics-h">Review these topics</div>
      <div className="rs-wtf-chips">
        {topics.map((t) => (
          <span key={t} className="rs-wtf-chip">
            {t}
          </span>
        ))}
      </div>
      <a
        className="rs-wtf-practise"
        href={`/student/bank/practice?subcat=${encodeURIComponent(target)}`}
      >
        Practise this category in the bank →
      </a>
    </div>
  );
}

function GenericAxis({ rows, empty }: { rows: BucketRow[]; empty: string }) {
  if (!rows.length) return <p className="rs-wtf-empty">{empty}</p>;
  return (
    <div className="rs-wtf-rows">
      {rows.map((r) => (
        <div className="rs-wtf-row" key={r.name}>
          <div className="rs-wtf-row-head">
            <span className="rs-wtf-name">{r.name}</span>
            <Val correct={r.correct} n={r.n} />
          </div>
          <Bar frac={r.frac} />
        </div>
      ))}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`rs-wtf-caret${open ? ' is-open' : ''}`}
      width="9"
      height="9"
      viewBox="0 0 10 10"
      aria-hidden
    >
      <path
        d="M3 1.5l4 3.5-4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WhereToFocus({ items }: { items: ReportItem[] }) {
  const [axis, setAxis] = useState<AxisKey>('needs');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, k: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setter(next);
  };

  const tree = clientNeedsTree(items);
  const cjmmCount = items.filter((i) => i.cjmmStep != null).length;

  const footNote: Record<AxisKey, string> = {
    needs:
      'Levels 1–2 are scored; the topic list under a subcategory is what to review, not a grade (topics are fine-grained, ~1 question each).',
    systems:
      'Weakest first. Some systems carry only a handful of questions — 100 can’t cover every system deeply, so these are counts, not percentages.',
    difficulty: 'How you held up as the questions got harder.',
    cjmm: `The NGN clinical-judgment steps — only your case-study questions carry these (${cjmmCount} of ${items.length}).`,
  };

  return (
    <div className="rs-wtf">
      <div className="rs-wtf-tabs">
        {AXES.map((a) => (
          <button
            key={a.k}
            type="button"
            className={`rs-wtf-tab${axis === a.k ? ' is-active' : ''}`}
            onClick={() => setAxis(a.k)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {axis === 'needs' && (
        <div className="rs-wtf-tree">
          {tree.map((cat) => {
            const expandable = cat.oneToOne ? cat.wrongTopics.length > 0 : cat.subs.length > 0;
            const open = openCats.has(cat.name);
            return (
              <div className="rs-wtf-cat" key={cat.name}>
                <button
                  type="button"
                  className={`rs-wtf-cat-head${expandable ? '' : ' is-flat'}`}
                  onClick={() => expandable && toggle(openCats, cat.name, setOpenCats)}
                  disabled={!expandable}
                >
                  {expandable ? <Caret open={open} /> : <span className="rs-wtf-caret-sp" />}
                  <span className="rs-wtf-name rs-wtf-cat-name">{cat.name}</span>
                  <Bar frac={cat.frac} />
                  <Val correct={cat.correct} n={cat.n} />
                </button>

                {open && cat.oneToOne && (
                  <TopicChecklist topics={cat.wrongTopics} target={cat.name} />
                )}

                {open &&
                  !cat.oneToOne &&
                  cat.subs.map((sub) => {
                    const subOpen = openSubs.has(sub.name);
                    const subExpandable = sub.wrongTopics.length > 0;
                    return (
                      <div className="rs-wtf-sub" key={sub.name}>
                        <button
                          type="button"
                          className={`rs-wtf-sub-head${subExpandable ? '' : ' is-flat'}`}
                          onClick={() =>
                            subExpandable && toggle(openSubs, sub.name, setOpenSubs)
                          }
                          disabled={!subExpandable}
                        >
                          {subExpandable ? (
                            <Caret open={subOpen} />
                          ) : (
                            <span className="rs-wtf-caret-sp" />
                          )}
                          <span className="rs-wtf-name">{sub.name}</span>
                          <Bar frac={sub.frac} />
                          <Val correct={sub.correct} n={sub.n} />
                        </button>
                        {subOpen && (
                          <TopicChecklist topics={sub.wrongTopics} target={sub.name} />
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {axis === 'systems' && (
        <GenericAxis rows={axisRows(items, 'systems')} empty="No body-system data in this pack." />
      )}
      {axis === 'difficulty' && (
        <GenericAxis rows={axisRows(items, 'difficulty')} empty="No difficulty data in this pack." />
      )}
      {axis === 'cjmm' && (
        <GenericAxis
          rows={axisRows(items, 'cjmm')}
          empty="This pack has no case-study (NGN) questions, so there’s no clinical-judgment breakdown."
        />
      )}

      <p className="rs-rep-foot">{footNote[axis]}</p>
    </div>
  );
}
