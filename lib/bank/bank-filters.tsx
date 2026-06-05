// mynclex/lib/bank/bank-filters.tsx
//
// Filter bar above the bank list. LIVE-APPLY + FACETED: list axes are
// multi-select checklists (OR within, AND across); on/off axes stay
// single. Every change navigates (router.replace) — search debounced —
// so the server re-queries and there's no "Apply" button. Shared by
// /admin/bank/all and the tutor twin.
//
// Param/value/apply logic lives in bank-list-query.ts — this file is the
// UI only. Styles: .bank-filter-* / .bank-ms-* in styles/dashboards.css.

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
  SEARCH_SCOPES,
  serializeBankFilters,
  hasAnyBankFilter,
  describeActiveFilters,
  emptyBankFilters,
  type BankFilterValues,
} from '@/lib/bank/bank-list-query';

const ALL_SUBCATEGORIES = Array.from(
  new Set(Object.values(CLIENT_NEEDS_SUBCATEGORIES).flat()),
);

interface Opt { value: string; label: string }
const toOpts = (xs: readonly string[]): Opt[] => xs.map((x) => ({ value: x, label: x }));

// Keys whose value is a string[] (multi-select).
type MultiKey =
  | 'type' | 'category' | 'subcategory' | 'subject' | 'bodySystem'
  | 'difficulty' | 'bloom' | 'membership' | 'tag';

export function BankFilters({
  values,
  baseUrl,
  tagOptions,
}: {
  values:     BankFilterValues;
  baseUrl:    string;
  tagOptions: string[];
}) {
  const router = useRouter();
  // Local mirror so controls feel instant; reconciled with incoming props
  // via React's render-time "adjust state when a prop changes" pattern
  // (compared by serialised signature — the server hands a fresh object).
  const [local, setLocal] = useState<BankFilterValues>(values);
  const sig = serializeBankFilters(values);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setLocal(values);
  }

  function navigate(next: BankFilterValues) {
    const qs = serializeBankFilters(next);
    router.replace(qs ? `${baseUrl}?${qs}` : baseUrl, { scroll: false });
  }

  function setMulti(field: MultiKey, vals: string[]) {
    const next: BankFilterValues = { ...local, [field]: vals };
    // Changing categories prunes now-orphaned subcategories.
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

  // Search box is debounced.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setSearch(q: string) {
    const next = { ...local, q };
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), 400);
  }
  function setSearchScopes(qf: string[]) {
    const next = { ...local, qf };
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

  return (
    <div className="bank-filters">
      <div className="bank-filter-grid">
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
          ]}
          onChange={(v) => setMulti('membership', v)} />

        <MultiSelect label="Tag" selected={local.tag}
          options={toOpts(tagOptions)}
          emptyHint="No tags yet"
          onChange={(v) => setMulti('tag', v)} />

        <SingleSelect label="Status" value={local.status}
          options={[{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }]}
          onChange={(v) => setSingle('status', v)} />

        <SingleSelect label="Free sample" value={local.freeSample} allLabel="Any"
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
          onChange={(v) => setSingle('freeSample', v)} />

        <SingleSelect label="Builder-visible" value={local.builderVisible} allLabel="Any"
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
          onChange={(v) => setSingle('builderVisible', v)} />

        {/* Scoped search — full-width row: [search-in checklist][ query ]. */}
        <div className="bank-filter-group bank-filter-search">
          <label className="bank-filter-label" htmlFor="bank-q">Search</label>
          <div className="bank-search-row">
            <MultiSelect
              inline
              label="Search in"
              emptyLabel="Stem"
              selected={local.qf}
              options={SEARCH_SCOPES.map((s) => ({ value: s.value, label: s.label }))}
              onChange={setSearchScopes}
            />
            <input
              id="bank-q"
              type="text"
              className="bank-filter-input bank-search-input"
              placeholder={`Search ${
                local.qf.length === 1
                  ? (SEARCH_SCOPES.find((s) => s.value === local.qf[0])?.label ?? 'Stem').toLowerCase()
                  : `${local.qf.length} fields`
              }…`}
              value={local.q}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {active && (
        <div className="bank-filter-active">
          <span className="bank-filter-count">
            {chips.length} {chips.length === 1 ? 'filter' : 'filters'}
          </span>
          {chips.map((c) => (
            <button
              key={`${c.field}:${c.value ?? ''}`}
              type="button"
              className="bank-filter-chip"
              onClick={() => clearChip(c.field, c.value)}
              title="Remove this filter"
            >
              {c.label}<span className="bank-filter-chip-x" aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="bank-filter-reset" onClick={reset}>
            Clear all
          </button>
        </div>
      )}
    </div>
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
        <span className="bank-ms-summary">{summary}</span>
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
