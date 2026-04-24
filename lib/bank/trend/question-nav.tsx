// mynclex/lib/bank/trend/question-nav.tsx
//
// Horizontal pill-strip navigator for the Trend editor's right pane
// (Slice 1.12b). Variable-count (unlike Case Study's fixed 6 slots).
// One pill per non-deleted child draft + a terminal `+ Add question`
// button. Overflow scrolls horizontally within the strip, not the
// pane.
//
// Pill copy:
//   • Persisted + typed:      `Q1 · MATRIX`
//   • Persisted, missing type: `Q1 · (no type)`
//   • Unsaved new draft:       same format + `•` unsaved indicator
//   • toDelete flagged:        strikethrough + `(pending delete)`
//
// Empty-state: when every draft has `toDelete === true` (or there are
// zero drafts), the strip still renders the `+ Add question` affordance
// so the curator can start over without reloading.

'use client';

import type { TrendChildDraft } from './child-draft';

interface Props {
  drafts:      TrendChildDraft[];
  activeIndex: number | null;
  onSelect:    (idx: number) => void;
  onAdd:       () => void;
}

export function QuestionNav({ drafts, activeIndex, onSelect, onAdd }: Props) {
  return (
    <div className="tr-q-nav-strip" role="tablist" aria-label="Trend attached questions">
      {drafts.map((d, idx) => {
        const isActive   = activeIndex === idx;
        const isEmpty    = d.item_id === null && !d.isDirty;
        const typeLabel  = d.initial.question_type || '—';
        const cls = [
          'tr-q-nav-pill',
          isActive        ? 'is-active' : '',
          d.toDelete      ? 'is-todelete' : '',
          isEmpty         ? 'is-empty' : '',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={idx}
            type="button"
            className={cls}
            onClick={() => onSelect(idx)}
            role="tab"
            aria-selected={isActive}
            aria-disabled={d.toDelete}
            title={
              d.toDelete
                ? 'Pending delete — save to commit or cancel to undo'
                : undefined
            }
          >
            <span className="tr-q-nav-num">Q{idx + 1}</span>
            <span className="tr-q-nav-type">{typeLabel}</span>
            {d.item_id === null && !d.toDelete && (
              <span className="tr-q-nav-unsaved" aria-hidden="true">•</span>
            )}
            {d.toDelete && (
              <span className="tr-q-nav-delbadge">pending delete</span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        className="tr-q-nav-add-btn"
        onClick={onAdd}
        aria-label="Add question"
      >
        + Add question
      </button>
    </div>
  );
}
