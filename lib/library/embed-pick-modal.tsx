'use client';

// mynclex/lib/library/embed-pick-modal.tsx
//
// "Pick from my bank" modal for the embedded-questions block
// (slice 11.15c). A real viewport modal (portaled to body) over the
// note editor — filter bar (Type / Category / Difficulty + search),
// a multi-select list of the tutor's embeddable bank questions, the
// per-block caps (soft nudge >5, hard stop at 10), and an empty-search
// state.
//
// Reads come from `getEmbeddableBankQuestions` (RLS-scoped to the
// tutor). Questions already in the block are excluded. On confirm, the
// chosen item_ids are handed back to the block via `onAdd`.
//
// Also exports the small shared atoms (EmbedTypeBadge, EmbedPillar)
// the filled-block reference cards reuse — kept here so the block file
// imports them without a circular dependency.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CLIENT_NEEDS_CATEGORIES,
  DIFFICULTY_LEVELS,
} from '@/lib/bank/classifications';
import { getEmbeddableBankQuestions } from './embed-actions';
import {
  EMBED_BLOCK_HARD_CAP,
  EMBED_BLOCK_SOFT_CAP,
  EMBED_QUESTION_TYPES,
  NCLEX_PILLARS,
  type EmbedQuestionRow,
  type NclexPillar,
} from './types';
import { pillarShortName } from './format';

// ── shared atoms (reused by the filled-block reference cards) ────────

const TYPE_META: Record<string, { label: string; cls: string }> = {
  MCQ: { label: 'MCQ', cls: 'mcq' },
  SATA: { label: 'SATA', cls: 'sata' },
  TF: { label: 'T/F', cls: 'tf' },
  SELECT_N: { label: 'Select N', cls: 'sn' },
};

export function EmbedTypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? { label: type, cls: 'mcq' };
  return <span className={`eq-type eq-type--${m.cls}`}>{m.label}</span>;
}

const PILLAR_SET = new Set<string>(NCLEX_PILLARS);

export function EmbedPillar({ name }: { name: string | null }) {
  if (!name) return null;
  const short = PILLAR_SET.has(name) ? pillarShortName(name as NclexPillar) : name;
  return (
    <span className="lib-meta-chip" title={name}>
      {short}
    </span>
  );
}

/** Highlight the search substring inside a stem. */
function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// ── the modal ────────────────────────────────────────────────────────

interface EmbedPickModalProps {
  /** item_ids already in the block — excluded from the list + counted as the base. */
  existingIds: string[];
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}

export function EmbedPickModal({ existingIds, onAdd, onClose }: EmbedPickModalProps) {
  // Snapshot the block's current ids once so the fetch effect doesn't
  // depend on a fresh array each render.
  const baseRef = useRef(existingIds);
  const base = baseRef.current.length;
  const excludeSet = useMemo(() => new Set(baseRef.current), []);

  const [rows, setRows] = useState<EmbedQuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('');
  const [pillarF, setPillarF] = useState('');
  const [diffF, setDiffF] = useState('');

  const total = base + selected.length;
  const capFull = total >= EMBED_BLOCK_HARD_CAP;
  const capWarn = total > EMBED_BLOCK_SOFT_CAP;

  // Re-fetch on filter change; debounce the search keystrokes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      getEmbeddableBankQuestions({
        type: typeF,
        pillar: pillarF,
        difficulty: diffF,
        q: search,
      }).then((data) => {
        if (cancelled) return;
        setRows(data.filter((r) => !excludeSet.has(r.item_id)));
        setLoading(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [typeF, pillarF, diffF, search, excludeSet]);

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (base + s.length >= EMBED_BLOCK_HARD_CAP) return s; // hard cap
      return [...s, id];
    });
  }

  const body = (
    <div
      className="eq-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="eq-modal" role="dialog" aria-modal="true" aria-label="Pick from my bank">
        <div className="eq-modal__head">
          <h3>Pick from my bank</h3>
          <p>
            Reuse questions from your tutor-private bank. Multi-select — they’re
            added in the order you pick.
          </p>
          <button className="eq-modal__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="eq-filterbar">
          <div className="eq-search">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search question text…"
              aria-label="Search question text"
            />
          </div>
          <select
            className="eq-fsel"
            value={typeF}
            onChange={(e) => setTypeF(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {EMBED_QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t]?.label ?? t}
              </option>
            ))}
          </select>
          <select
            className="eq-fsel"
            value={pillarF}
            onChange={(e) => setPillarF(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {CLIENT_NEEDS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PILLAR_SET.has(c) ? pillarShortName(c as NclexPillar) : c}
              </option>
            ))}
          </select>
          <select
            className="eq-fsel"
            value={diffF}
            onChange={(e) => setDiffF(e.target.value)}
            aria-label="Filter by difficulty"
          >
            <option value="">All difficulty</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="eq-listmeta">
          <span>
            {loading
              ? 'Loading…'
              : `${rows.length} question${rows.length === 1 ? '' : 's'}`}
          </span>
          {!loading && rows.length > 0 && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <span>Newest first</span>
            </>
          )}
        </div>

        <div className="eq-picklist">
          {!loading && rows.length === 0 && (
            <div className="eq-empty-search">
              <strong>
                {search.trim()
                  ? `No questions match “${search.trim()}”.`
                  : 'No published questions match these filters.'}
              </strong>
              <span>
                Try fewer words, clear a filter, or create a new question for
                this note instead.
              </span>
            </div>
          )}
          {rows.map((q) => {
            const on = selected.includes(q.item_id);
            const disabled = !on && capFull;
            return (
              <div
                key={q.item_id}
                className={`eq-pickrow${on ? ' on' : ''}${disabled ? ' disabled' : ''}`}
                onClick={() => !disabled && toggle(q.item_id)}
                role="button"
                aria-pressed={on}
              >
                <span className="eq-ck" aria-hidden="true">{on ? '✓' : ''}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="eq-pickrow__meta">
                    <EmbedTypeBadge type={q.question_type} />
                    <EmbedPillar name={q.pillar} />
                    {q.difficulty && (
                      <span className={`eq-diff ${q.difficulty.toLowerCase()}`}>
                        <span className="d" />
                        {q.difficulty}
                      </span>
                    )}
                    <span className="eq-id">{q.item_id}</span>
                    {q.is_note_created && (
                      <span className="eq-chip-note">
                        <span aria-hidden="true">✎</span> Note-created
                      </span>
                    )}
                  </div>
                  <div className="eq-pickrow__stem">{highlight(q.stem, search)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {capFull ? (
          <div className="eq-hardstop">
            <div>
              <b>Block is full — {EMBED_BLOCK_HARD_CAP} of {EMBED_BLOCK_HARD_CAP}.</b>{' '}
              That’s the hard limit per block. Remove one to swap, or split the
              rest into a second block below.
            </div>
          </div>
        ) : capWarn ? (
          <div className="eq-nudge">
            <div>
              <b>That’s more than {EMBED_BLOCK_SOFT_CAP} in one block.</b> Long
              sets read better as a quiz.
            </div>
          </div>
        ) : null}

        <div className="eq-modal__foot">
          <span className="eq-selcount">
            <b>{selected.length}</b> selected
          </span>
          <span className={`eq-counter${capFull ? ' full' : capWarn ? ' warn' : ''}`}>
            <span className="lbl">block</span>
            {total} / {EMBED_BLOCK_HARD_CAP}
          </span>
          <span style={{ flex: 1 }} />
          <button className="eq-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="eq-btn eq-btn--accent"
            disabled={selected.length === 0}
            onClick={() => onAdd(selected)}
          >
            Add {selected.length || ''} question{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}
