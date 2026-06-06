// mynclex/lib/tutor-quiz/quiz-picker-filters.tsx
//
// Compact, live-apply filter toolbar for the quiz editor's question
// picker. Modelled on the bank list's toolbar (search box + a "Filters"
// popover of multi-select facets + active chips) but TAILORED and
// self-contained — the picker is hard-scoped to the tutor's published,
// standalone questions, so there's no Status / Membership / sort / group.
//
// Live-apply: every change navigates (router.replace; search debounced),
// the server page re-queries getPickerQuestions(), and the editor's
// in-progress "selected to add" state survives (the editor component
// stays mounted across the soft navigation).
//
// Param/value/apply logic lives in quiz-picker-query.ts — this file is
// UI. Reuses the bank's `bl-*` toolbar + `bank-ms-*` multi-select CSS
// (class names only, not the component).

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QUESTION_TYPES,
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  NURSING_SUBJECTS,
  BODY_SYSTEMS,
  DIFFICULTY_LEVELS,
  BLOOM_LEVELS,
} from '@/lib/bank/classifications';
import {
  PICKER_SEARCH_SCOPES,
  serializeQuizPickerFilters,
  buildQuizPickerUrl,
  hasAnyQuizFilter,
  describeActiveQuizFilters,
  emptyQuizPickerFilters,
  type QuizPickerFilters,
} from './quiz-picker-query';

const ALL_SUBCATEGORIES = Array.from(
  new Set(Object.values(CLIENT_NEEDS_SUBCATEGORIES).flat()),
);

interface Opt { value: string; label: string }
const toOpts = (xs: readonly string[]): Opt[] =>
  xs.map((x) => ({ value: x, label: x }));

type MultiKey =
  | 'type' | 'category' | 'subcategory' | 'subject'
  | 'bodySystem' | 'difficulty' | 'bloom' | 'tag';

function facetCount(f: QuizPickerFilters): number {
  return (
    f.type.length + f.category.length + f.subcategory.length +
    f.subject.length + f.bodySystem.length + f.difficulty.length +
    f.bloom.length + f.tag.length
  );
}

export function QuizPickerFilterBar({
  values,
  baseUrl,
  tagOptions,
}: {
  values: QuizPickerFilters;
  baseUrl: string;
  tagOptions: string[];
}) {
  const router = useRouter();
  // Local mirror so controls feel instant; reconciled when a fresh prop
  // arrives (compared by serialised signature).
  const [local, setLocal] = useState<QuizPickerFilters>(values);
  const sig = serializeQuizPickerFilters(values);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setLocal(values);
  }

  const [showFacets, setShowFacets] = useState(false);

  function navigate(next: QuizPickerFilters) {
    router.replace(buildQuizPickerUrl(baseUrl, next), { scroll: false });
  }

  function setMulti(field: MultiKey, vals: string[]) {
    const next: QuizPickerFilters = { ...local, [field]: vals };
    if (field === 'category') {
      const allowed = vals.length
        ? new Set(
            vals.flatMap(
              (c) =>
                CLIENT_NEEDS_SUBCATEGORIES[
                  c as keyof typeof CLIENT_NEEDS_SUBCATEGORIES
                ] ?? [],
            ),
          )
        : new Set(ALL_SUBCATEGORIES);
      next.subcategory = local.subcategory.filter((s) => allowed.has(s));
    }
    setLocal(next);
    navigate(next);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setSearch(q: string) {
    const next = { ...local, q };
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), 400);
  }
  function setSearchScopes(qf: string[]) {
    const next = { ...local, qf: qf.length ? qf : ['stem'] };
    setLocal(next);
    if (next.q) navigate(next);
  }

  function clearChip(field: keyof QuizPickerFilters, value?: string) {
    let next: QuizPickerFilters;
    if (value !== undefined) {
      next = {
        ...local,
        [field]: (local[field] as string[]).filter((v) => v !== value),
      };
    } else if (field === 'q') {
      next = { ...local, q: '', qf: ['stem'] };
    } else {
      next = { ...local, [field]: '' };
    }
    setLocal(next);
    navigate(next);
  }

  function reset() {
    const next = emptyQuizPickerFilters();
    setLocal(next);
    navigate(next);
  }

  const subcategoryOptions = local.category.length
    ? Array.from(
        new Set(
          local.category.flatMap(
            (c) =>
              CLIENT_NEEDS_SUBCATEGORIES[
                c as keyof typeof CLIENT_NEEDS_SUBCATEGORIES
              ] ?? [],
          ),
        ),
      )
    : ALL_SUBCATEGORIES;

  const chips = describeActiveQuizFilters(local);
  const active = hasAnyQuizFilter(local);
  const nFacets = facetCount(local);

  const scopeLabel =
    local.qf.length <= 1
      ? (
          PICKER_SEARCH_SCOPES.find((s) => s.value === (local.qf[0] ?? 'stem'))
            ?.label ?? 'Stem'
        ).toLowerCase()
      : `${local.qf.length} fields`;

  return (
    <>
      <div className="bl-toolbar">
        <div className="bl-search">
          <SearchIcon />
          <input
            className="has-scope"
            type="text"
            placeholder={`Search ${scopeLabel}…`}
            value={local.q}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search your questions"
          />
          <MultiSelect
            inline
            label="Search in"
            emptyLabel="Stem"
            selected={local.qf}
            options={PICKER_SEARCH_SCOPES.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
            onChange={setSearchScopes}
          />
        </div>

        <div className="bl-filter-wrap">
          <button
            type="button"
            className="bl-btn"
            onClick={() => setShowFacets((v) => !v)}
          >
            <FilterIcon />
            Filters
            {nFacets > 0 && <span className="bl-filter-badge">{nFacets}</span>}
          </button>
          {showFacets && (
            <FacetPopover
              local={local}
              tagOptions={tagOptions}
              subcategoryOptions={subcategoryOptions}
              setMulti={setMulti}
              onReset={reset}
              onClose={() => setShowFacets(false)}
            />
          )}
        </div>
      </div>

      {active && (
        <div className="bl-active">
          <span className="bl-active-count">
            {chips.length} {chips.length === 1 ? 'filter' : 'filters'}
          </span>
          {chips.map((c) => (
            <button
              key={`${c.field}:${c.value ?? ''}`}
              type="button"
              className="bl-active-chip"
              onClick={() => clearChip(c.field, c.value)}
              title="Remove this filter"
            >
              {c.label}
              <span className="x" aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="bl-active-clear" onClick={reset}>
            Clear all
          </button>
        </div>
      )}
    </>
  );
}

// ── Faceted popover (the full filter grid) ────────────────────────
function FacetPopover({
  local,
  tagOptions,
  subcategoryOptions,
  setMulti,
  onReset,
  onClose,
}: {
  local: QuizPickerFilters;
  tagOptions: string[];
  subcategoryOptions: string[];
  setMulti: (field: MultiKey, vals: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="bl-facet-pop" ref={ref}>
      <div className="bl-facet-grid">
        <MultiSelect
          label="Type"
          selected={local.type}
          options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.value }))}
          onChange={(v) => setMulti('type', v)}
        />
        <MultiSelect
          label="Category"
          selected={local.category}
          options={toOpts(CLIENT_NEEDS_CATEGORIES)}
          onChange={(v) => setMulti('category', v)}
        />
        <MultiSelect
          label="Subcategory"
          selected={local.subcategory}
          options={toOpts(subcategoryOptions)}
          onChange={(v) => setMulti('subcategory', v)}
        />
        <MultiSelect
          label="Nursing subject"
          selected={local.subject}
          options={toOpts(NURSING_SUBJECTS)}
          onChange={(v) => setMulti('subject', v)}
        />
        <MultiSelect
          label="Body system"
          selected={local.bodySystem}
          options={toOpts(BODY_SYSTEMS)}
          onChange={(v) => setMulti('bodySystem', v)}
        />
        <MultiSelect
          label="Difficulty"
          selected={local.difficulty}
          options={toOpts(DIFFICULTY_LEVELS)}
          onChange={(v) => setMulti('difficulty', v)}
        />
        <MultiSelect
          label="Bloom level"
          selected={local.bloom}
          options={toOpts(BLOOM_LEVELS)}
          onChange={(v) => setMulti('bloom', v)}
        />
        <MultiSelect
          label="Tag"
          selected={local.tag}
          options={toOpts(tagOptions)}
          emptyHint="No tags yet"
          onChange={(v) => setMulti('tag', v)}
        />
      </div>
      <div className="bl-facet-foot">
        <button type="button" className="bl-active-clear" onClick={onReset}>
          Reset all filters
        </button>
        <button type="button" className="bl-btn bl-btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="10" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── Multi-select checklist (button + popover) ─────────────────────
function MultiSelect({
  label,
  selected,
  options,
  onChange,
  emptyHint,
  emptyLabel = 'All',
  inline = false,
}: {
  label: string;
  selected: string[];
  options: Opt[];
  onChange: (v: string[]) => void;
  emptyHint?: string;
  emptyLabel?: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(
      selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v],
    );
  }

  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  const wrapClass =
    (inline ? 'bank-ms-inline' : 'bank-filter-group') +
    (selected.length ? ' is-set' : '');

  return (
    <div className={wrapClass} ref={ref}>
      {!inline && <span className="bank-filter-label">{label}</span>}
      <button
        type="button"
        className="bank-filter-input bank-ms-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="bank-ms-summary">{inline ? `in: ${summary}` : summary}</span>
        <span className="bank-ms-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="bank-ms-panel" role="listbox" aria-label={label}>
          {options.length === 0 ? (
            <div className="bank-ms-empty">{emptyHint ?? 'No options'}</div>
          ) : (
            options.map((o) => (
              <label key={o.value} className="bank-ms-option">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
