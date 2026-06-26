// mynclex/lib/library/analytics/questions-tab.tsx
//
// The per-note Questions tab (slice 11.11c, Slice 2) — block-grouped,
// collapsible question rows. A row shows the stem + first-try accuracy
// bar + reach; expanding it reveals the full first-attempt answer
// distribution (every option, KEY + TOP-MISS flagged) and the
// "First try → After re-practice (+lift)" convergence read.
//
// Client component (the expand/collapse is interactive). Concept from
// the CD "Question analytics" prototype, rebuilt in the app shell.

'use client';

import { useState } from 'react';
import type { EmbedBlockDetail, EmbedQuestionDetail } from './types';

export function QuestionsTab({
  blocks,
  initialOpen,
}: {
  blocks: EmbedBlockDetail[];
  initialOpen?: string | null;
}) {
  // Open key = blockId|itemId (a question can sit in two blocks). Seed
  // from ?q=<itemId> — open the first row matching that item.
  const seed = (() => {
    if (!initialOpen) return null;
    for (const b of blocks) {
      for (const q of b.questions) {
        if (q.itemId === initialOpen) return `${b.blockId}|${q.itemId}`;
      }
    }
    return null;
  })();
  const [open, setOpen] = useState<string | null>(seed);

  return (
    <div className="eqa-blocks">
      {blocks.map((b) => (
        <section key={b.blockId} className="eqa-block">
          <div className="eqa-block-head">
            <span className="eqa-block-tag">Block {b.index + 1}</span>
            <h3 className="eqa-block-title">{b.title}</h3>
            <span className="eqa-block-summary">
              {b.answers} answer{b.answers === 1 ? '' : 's'} ·{' '}
              {b.questionCount} question{b.questionCount === 1 ? '' : 's'}
            </span>
            <span className="eqa-block-spacer" />
            {b.firstAccPct != null && (
              <span className="eqa-block-acc" data-tier={b.tier ?? 'holding'}>
                {b.firstAccPct}% first-try
              </span>
            )}
          </div>
          <div className="eqa-qrows">
            {b.questions.map((q) => {
              const key = `${b.blockId}|${q.itemId}`;
              return (
                <QuestionRow
                  key={key}
                  q={q}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function QuestionRow({
  q,
  open,
  onToggle,
}: {
  q: EmbedQuestionDetail;
  open: boolean;
  onToggle: () => void;
}) {
  const head = (
    <div className="eqa-qrow-main">
      <div className="eqa-qrow-tags">
        <span className="eqa-qrow-type">{q.typeLabel}</span>
        <span className="eqa-qrow-n">Q{q.n}</span>
      </div>
      <div className="eqa-qrow-stem">{q.stem}</div>
    </div>
  );

  if (q.noData) {
    return (
      <div className="eqa-qrow eqa-qrow--nodata">
        {head}
        <span className="eqa-qrow-nodata-lbl">Not answered yet</span>
      </div>
    );
  }

  return (
    <div className={`eqa-qrow${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="eqa-qrow-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        {head}
        <div className="eqa-qrow-acc">
          <div className="eqa-bar">
            <span
              className="eqa-bar-fill"
              data-tier={q.tier ?? 'holding'}
              style={{ width: `${q.firstAccPct}%` }}
            />
          </div>
          <span className="eqa-qrow-pct" data-tier={q.tier ?? 'holding'}>
            {q.firstAccPct}%
          </span>
        </div>
        <div className="eqa-qrow-reach">
          <div className="eqa-qrow-read">{q.reach} read</div>
          <div className="eqa-qrow-retried">
            {q.retriedN > 0 ? `${q.retriedN} retried` : 'no retries'}
          </div>
        </div>
        <span className="eqa-qrow-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="eqa-qrow-body">
          {q.thin && (
            <div className="eqa-qrow-thin">
              Only {q.reach} reader{q.reach === 1 ? '' : 's'} so far — read the
              split with caution.
            </div>
          )}
          <div className="eqa-dist-note">Answer distribution · {q.distNote}</div>
          <div className="eqa-dist">
            {q.options.map((o, i) => {
              const kind = o.isKey ? 'key' : o.isTrap ? 'trap' : 'neutral';
              return (
                <div key={i} className="eqa-opt">
                  <span className="eqa-opt-letter" data-kind={kind}>
                    {o.letter}
                  </span>
                  <div className="eqa-opt-text">
                    <span data-kind={o.isKey ? 'key' : 'neutral'}>{o.text}</span>
                    {o.isKey && (
                      <span className="eqa-badge eqa-badge--key">KEY</span>
                    )}
                    {o.isTrap && (
                      <span className="eqa-badge eqa-badge--trap">TOP MISS</span>
                    )}
                  </div>
                  <div className="eqa-bar eqa-opt-bar">
                    <span
                      className="eqa-opt-fill"
                      data-kind={kind}
                      style={{ width: `${o.pct}%` }}
                    />
                  </div>
                  <span className="eqa-opt-pct">{o.pct}%</span>
                </div>
              );
            })}
          </div>
          <div className="eqa-qrow-foot">
            <div>
              <span className="eqa-foot-lbl">First try</span>
              <span className="eqa-foot-val" data-tier={q.tier ?? 'holding'}>
                {q.firstAccPct}%
              </span>
            </div>
            <div>
              <span className="eqa-foot-lbl">After re-practice</span>
              <span className="eqa-foot-val eqa-foot-val--ok">
                {q.latestAccPct}%
              </span>
              <span className="eqa-foot-lift">
                {q.liftPts > 0 ? `+${q.liftPts} pts` : 'no change'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
