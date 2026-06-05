// mynclex/lib/bank/bank-filters.tsx
//
// The Question Bank list's compact toolbar (2026-06 Claude Design "Bank
// surfaces" redesign — the Hybrid). Replaces the old always-visible filter
// grid with a single toolbar row: scoped search · Status segment · a
// "Filters" popover holding every facet · a right slot (the "+ New
// question" button). An active-filter chip row sits below.
//
// LIVE-APPLY + FACETED (unchanged logic): list axes are multi-select
// (OR within, AND across); on/off axes (Free sample, Builder-visible) stay
// single; Status is the segmented control. Every change navigates
// (router.replace, search debounced) so the server re-queries — no Apply.
//
// Param/value/apply logic lives in bank-list-query.ts — this file is UI.
// Rendered by BankListClient (so the whole toolbar is one row with the New
// button + the sort/group controls). Styles: styles/bank-list.css (`bl-*`)
// + the .bank-ms-* multi-select popovers from styles/dashboards.css.

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  SEARCH_SCOPES,
  serializeBankFilters,
  hasAnyBankFilter,
  describeActiveFilters,
  emptyBankFilters,
  type BankFilterValues,
} from '@/lib/bank/bank-list-query';
import { SearchIcon } from '@/lib/bank/list-ui';

const ALL_SUBCATEGORIES = Array.from(
  new Set(Object.values(CLIENT_NEEDS_SUBCATEGORIES).flat()),
);

interface Opt { value: string; label: string }
const toOpts = (xs: readonly string[]): Opt[] => xs.map((x) => ({ value: x, label: x }));

type MultiKey =
  | 'type' | 'category' | 'subcategory' | 'subject' | 'bodySystem'
  | 'difficulty' | 'bloom' | 'membership' | 'tag';

// Count of active facets shown inside the popover (everything except Status,
// which is the segmented control, and the search box) — drives the button
// badge.
function facetCount(f: BankFilterValues): number {
  return (
    f.type.length + f.category.length + f.subcategory.length + f.subject.length +
    f.bodySystem.length + f.difficulty.length + f.bloom.length + f.membership.length +
    f.tag.length + (f.freeSample ? 1 : 0) + (f.builderVisible ? 1 : 0)
  );
}

export function BankToolbar({
  values,
  baseUrl,
  tagOptions,
  rightSlot,
  group,
  onGroupToggle,
}: {
  values:     BankFilterValues;
  baseUrl:    string;
  tagOptions: string[];
  /** Right-aligned slot — the "+ New question" button. */
  rightSlot?: ReactNode;
  /** Group-by-membership toggle state + handler (rendered when provided). */
  group?:         boolean;
  onGroupToggle?: () => void;
}) {
  const router = useRouter();
  // Local mirror so controls feel instant; reconciled when a fresh prop
  // arrives (compared by serialised signature).
  const [local, setLocal] = useState<BankFilterValues>(values);
  const sig = serializeBankFilters(values);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setLocal(values);
  }

  const [showFacets, setShowFacets] = useState(false);

  function navigate(next: BankFilterValues) {
    const qs = serializeBankFilters(next);
    router.replace(qs ? `${baseUrl}?${qs}` : baseUrl, { scroll: false });
  }

  function setMulti(field: MultiKey, vals: string[]) {
    const next: BankFilterValues = { ...local, [field]: vals };
    if (field === 'category') {
      const allowed = vals.length
        ? new Set(vals.flatMap((c) => CLIENT_NEEDS_SUBCATEGORIES[c as keyof typeof CLIENT_NEEDS_SUBCATEGORIES] ?? []))
        : new Set(ALL_SUBCATEGORIES);
      next.subcategory = local.subcategory.filter((s) => allowed.has(s));
    }
    setLocal(next);
    navigate(next);
  }

  function setSingle(field: 'status' | 'freeSample' | 'builderVisible', v: string) {
    const next = { ...local, [field]: v };
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
    // Never drop below the default — at least one field is always searched.
    const next = { ...local, qf: qf.length ? qf : ['stem'] };
    setLocal(next);
    if (next.q) navigate(next);
  }

  function clearChip(field: keyof BankFilterValues, value?: string) {
    let next: BankFilterValues;
    if (value !== undefined) {
      next = { ...local, [field]: (local[field] as string[]).filter((v) => v !== value) };
    } else if (field === 'q') {
      next = { ...local, q: '', qf: ['stem'] };
    } else {
      next = { ...local, [field]: '' };
    }
    setLocal(next);
    navigate(next);
  }

  function reset() {
    const next = emptyBankFilters();
    setLocal(next);
    navigate(next);
  }

  const subcategoryOptions = local.category.length
    ? Array.from(new Set(local.category.flatMap(
        (c) => CLIENT_NEEDS_SUBCATEGORIES[c as keyof typeof CLIENT_NEEDS_SUBCATEGORIES] ?? [])))
    : ALL_SUBCATEGORIES;

  const chips = describeActiveFilters(local);
  const active = hasAnyBankFilter(local);
  const nFacets = facetCount(local);

  const scopeLabel =
    local.qf.length <= 1
      ? (SEARCH_SCOPES.find((s) => s.value === (local.qf[0] ?? 'stem'))?.label ?? 'Stem').toLowerCase()
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
            aria-label="Search the bank"
          />
          {/* "Search in" scope picker — our MultiSelect dropdown, docked
              inside the search field (trailing-right). */}
          <MultiSelect
            inline
            label="Search in"
            emptyLabel="Stem"
            selected={local.qf}
            options={SEARCH_SCOPES.map((s) => ({ value: s.value, label: s.label }))}
            onChange={setSearchScopes}
          />
        </div>

        <div className="bl-seg" role="group" aria-label="Status">
          {['', 'published', 'draft'].map((s) => (
            <button
              key={s || 'all'}
              type="button"
              className={local.status === s ? 'on' : ''}
              onClick={() => setSingle('status', s)}
            >
              {s === '' ? 'All' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {onGroupToggle && (
          <button
            type="button"
            className={`bl-btn${group ? ' is-on' : ''}`}
            onClick={onGroupToggle}
            title="Group rows by membership"
          >
            <GroupIcon />
            Group
          </button>
        )}

        <div className="bl-filter-wrap">
          <button type="button" className="bl-btn" onClick={() => setShowFacets((v) => !v)}>
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
              setSingle={setSingle}
              onReset={reset}
              onClose={() => setShowFacets(false)}
            />
          )}
        </div>

        {rightSlot}
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
              {c.label}<span className="x" aria-hidden="true">×</span>
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
  setSingle,
  onReset,
  onClose,
}: {
  local:              BankFilterValues;
  tagOptions:         string[];
  subcategoryOptions: string[];
  setMulti:           (field: MultiKey, vals: string[]) => void;
  setSingle:          (field: 'freeSample' | 'builderVisible', v: string) => void;
  onReset:            () => void;
  onClose:            () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
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
        <MultiSelect label="Type" selected={local.type}
          options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.value }))}
          onChange={(v) => setMulti('type', v)} />
        <MultiSelect label="Category" selected={local.category}
          options={toOpts(CLIENT_NEEDS_CATEGORIES)}
          onChange={(v) => setMulti('category', v)} />
        <MultiSelect label="Subcategory" selected={local.subcategory}
          options={toOpts(subcategoryOptions)}
          onChange={(v) => setMulti('subcategory', v)} />
        <MultiSelect label="Nursing subject" selected={local.subject}
          options={toOpts(NURSING_SUBJECTS)}
          onChange={(v) => setMulti('subject', v)} />
        <MultiSelect label="Body system" selected={local.bodySystem}
          options={toOpts(BODY_SYSTEMS)}
          onChange={(v) => setMulti('bodySystem', v)} />
        <MultiSelect label="Difficulty" selected={local.difficulty}
          options={toOpts(DIFFICULTY_LEVELS)}
          onChange={(v) => setMulti('difficulty', v)} />
        <MultiSelect label="Bloom level" selected={local.bloom}
          options={toOpts(BLOOM_LEVELS)}
          onChange={(v) => setMulti('bloom', v)} />
        <MultiSelect label="Membership" selected={local.membership}
          options={[
            { value: 'standalone', label: 'Standalone' },
            { value: 'case',       label: 'Case-linked' },
            { value: 'trend',      label: 'Trend-linked' },
            { value: 'note',       label: 'Note-born' },
          ]}
          onChange={(v) => setMulti('membership', v)} />
        <MultiSelect label="Tag" selected={local.tag}
          options={toOpts(tagOptions)}
          emptyHint="No tags yet"
          onChange={(v) => setMulti('tag', v)} />
        <SingleSelect label="Free sample" value={local.freeSample} allLabel="Any"
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
          onChange={(v) => setSingle('freeSample', v)} />
        <SingleSelect label="Builder-visible" value={local.builderVisible} allLabel="Any"
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
          onChange={(v) => setSingle('builderVisible', v)} />
      </div>
      <div className="bl-facet-foot">
        <button type="button" className="bl-active-clear" onClick={onReset}>Reset all filters</button>
        <button type="button" className="bl-btn bl-btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
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
  label:      string;
  selected:   string[];
  options:    Opt[];
  onChange:   (v: string[]) => void;
  emptyHint?: string;
  emptyLabel?: string;
  inline?:    boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  const summary =
    selected.length === 0 ? emptyLabel
    : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} selected`;

  const wrapClass =
    (inline ? 'bank-ms-inline' : 'bank-filter-group') + (selected.length ? ' is-set' : '');

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

// ── Single-select dropdown (on/off axes) ──────────────────────────
function SingleSelect({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
}: {
  label:    string;
  value:    string;
  options:  Opt[];
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const id = `bf-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div className={`bank-filter-group${value ? ' is-set' : ''}`}>
      <label className="bank-filter-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="bank-filter-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
