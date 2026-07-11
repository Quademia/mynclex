// mynclex/lib/bank/packs/picker.tsx
//
// The "Add questions" slide-over (Slice ②b), from the CD "Readiness
// Packs Admin" prototype (concept-not-source). Three tabs: standalone
// questions (tick several → one footer add), case studies (atomic
// per-unit add — §5), and trends (per-question checkboxes — the
// 2026-07-07 §5 revision; a batch lands consecutively at the insertion
// point in item-id order). Candidates load once on open via a server
// action; search + facets filter client-side, prototype-style.
//
// The insert pill mirrors the ⊕ semantics: null anchor = append at the
// end; an anchor = insert above that unit ("Inserting at position N",
// with a "switch to end" escape).

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  BLOOM_LEVELS,
  BODY_SYSTEMS,
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  DIFFICULTY_LEVELS,
  NURSING_SUBJECTS,
  QUESTION_TYPES,
} from '@/lib/bank/classifications';
import { ErrorToast } from '@/lib/toast/error-toast';
import { InfoToast } from '@/lib/toast/info-toast';
import {
  addPackCaseAction,
  addPackStandalonesAction,
  addPackTrendQuestionsAction,
  loadPackPickerAction,
} from './actions';
import type {
  PackPickerData,
  PickerCase,
  PickerQuestion,
  PickerTrend,
} from './types';

export interface PickerInsertAt {
  /** First link row of the unit to insert above. */
  linkId: string;
  /** Dense printed position the batch will land at (label only). */
  pos: number;
}

const SUBCATS = Object.values(CLIENT_NEEDS_SUBCATEGORIES).flat();

const DIFF_CLASS: Record<string, string> = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
};

// ── Facet machinery (shared by both panes) ──────────────────────────

interface FacetDef {
  key:   string;
  label: string;
  opts:  readonly string[];
}

const Q_FACETS: FacetDef[] = [
  { key: 'type',    label: 'Type',            opts: QUESTION_TYPES.map((t) => t.value) },
  { key: 'cat',     label: 'Category',        opts: CLIENT_NEEDS_CATEGORIES },
  { key: 'subcat',  label: 'Subcategory',     opts: SUBCATS },
  { key: 'subject', label: 'Nursing subject', opts: NURSING_SUBJECTS },
  { key: 'sys',     label: 'Body system',     opts: BODY_SYSTEMS },
  { key: 'diff',    label: 'Difficulty',      opts: DIFFICULTY_LEVELS },
  { key: 'bloom',   label: 'Bloom level',     opts: BLOOM_LEVELS },
];

type FacetState = Record<string, string[]>;

const emptyFacets = (defs: FacetDef[]): FacetState =>
  Object.fromEntries(defs.map((d) => [d.key, []]));

const inArr = (arr: string[], v: string | null) =>
  arr.length === 0 || (v !== null && arr.includes(v));

const anyChild = (arr: string[], vals: string[]) =>
  arr.length === 0 || vals.some((v) => arr.includes(v));

// ── The slide-over ──────────────────────────────────────────────────

export function PackPicker({
  packId,
  packTitle,
  open,
  insertAt,
  onSwitchToEnd,
  onClose,
  onChanged,
}: {
  packId:    string;
  packTitle: string;
  open:      boolean;
  insertAt:  PickerInsertAt | null;
  onSwitchToEnd: () => void;
  onClose:   () => void;
  /** Fired after any successful add (parent refreshes the page data). */
  onChanged: () => void;
}) {
  const [data, setData] = useState<PackPickerData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadInFlight = useRef(false);

  const [tab, setTab] = useState<'q' | 'case' | 'trend'>('q');
  const [qFacets, setQFacets] = useState<FacetState>(() => emptyFacets(Q_FACETS));
  const [qSearch, setQSearch] = useState('');
  const [wFacets, setWFacets] = useState<FacetState>({ subcat: [], sys: [], nq: [] });
  const [wSearch, setWSearch] = useState('');
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [msOpen, setMsOpen] = useState<string | null>(null);

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [trendPicked, setTrendPicked] = useState<Record<string, boolean>>({});
  const [expandedTrends, setExpandedTrends] = useState<Record<string, boolean>>({});

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Lazy first load on open, and a re-load after every successful add
  // (the pool and the badges both change — `data` is reset to null).
  // All setState happens in the promise callback (never synchronously
  // in the effect body); the ref guards against a double fetch.
  useEffect(() => {
    if (!open || data !== null || loadError !== null || loadInFlight.current) return;
    loadInFlight.current = true;
    loadPackPickerAction(packId).then((res) => {
      loadInFlight.current = false;
      if (res.ok) setData(res.data);
      else setLoadError(res.error);
    });
  }, [open, data, loadError, packId]);

  // ── Filtering (client-side, prototype parity) ─────────────────────
  const filteredQ = useMemo(() => {
    if (!data) return [];
    const f = qFacets;
    const term = qSearch.trim().toLowerCase();
    return data.standalones.filter(
      (q) =>
        inArr(f.type, q.questionType) &&
        inArr(f.cat, q.category) &&
        inArr(f.subcat, q.subcategory) &&
        inArr(f.subject, q.subject) &&
        inArr(f.sys, q.bodySystem) &&
        inArr(f.diff, q.difficulty) &&
        inArr(f.bloom, q.bloom) &&
        anyChild(f.tags ?? [], q.tags) &&
        (!term || `${q.stemLabel} ${q.itemId}`.toLowerCase().includes(term)),
    );
  }, [data, qFacets, qSearch]);

  const filteredCases = useMemo(() => {
    if (!data) return [];
    const term = wSearch.trim().toLowerCase();
    return data.cases.filter(
      (c) =>
        anyChild(wFacets.subcat, c.childSubcats) &&
        anyChild(wFacets.sys, c.childSystems) &&
        (!term || `${c.title} ${c.caseId}`.toLowerCase().includes(term)),
    );
  }, [data, wFacets, wSearch]);

  const filteredTrends = useMemo(() => {
    if (!data) return [];
    const term = wSearch.trim().toLowerCase();
    return data.trends.filter(
      (t) =>
        anyChild(wFacets.subcat, t.children.map((c) => c.subcategory).filter(Boolean) as string[]) &&
        anyChild(wFacets.sys, t.children.map((c) => c.bodySystem).filter(Boolean) as string[]) &&
        (wFacets.nq.length === 0 || wFacets.nq.includes(String(t.children.length))) &&
        (!term ||
          `${t.title} ${t.trendId} ${t.children.map((c) => c.itemId).join(' ')}`
            .toLowerCase()
            .includes(term)),
    );
  }, [data, wFacets, wSearch]);

  const trendNqOpts = useMemo(
    () =>
      data
        ? [...new Set(data.trends.map((t) => t.children.length))]
            .sort((a, b) => a - b)
            .map(String)
        : [],
    [data],
  );

  // Tags are free-form (not a fixed classification enum), so the facet's
  // options are derived from the loaded standalone pool. The facet is only
  // offered when the pool actually carries tags.
  const tagOpts = useMemo(
    () =>
      data
        ? [...new Set(data.standalones.flatMap((q) => q.tags))].filter(Boolean).sort()
        : [],
    [data],
  );
  const qDefs = useMemo<FacetDef[]>(
    () => (tagOpts.length ? [...Q_FACETS, { key: 'tags', label: 'Tags', opts: tagOpts }] : Q_FACETS),
    [tagOpts],
  );

  // Selection is GLOBAL across the whole standalone pool (keyed by item id),
  // not scoped to the current filter — so ticks made under one filter aren't
  // silently dropped when the curator narrows to another. The footer + add
  // both read this global set.
  const eligibleStandalones = useMemo(
    () => (data ? data.standalones.filter((q) => !q.inPack) : []),
    [data],
  );
  const pickedIds = useMemo(
    () => eligibleStandalones.filter((q) => picked[q.itemId]).map((q) => q.itemId),
    [eligibleStandalones, picked],
  );

  // Select-all operates on the CURRENTLY FILTERED eligible rows (compose it
  // with the facets: filter → select all → add). Tri-state against them.
  const eligibleFiltered = useMemo(() => filteredQ.filter((q) => !q.inPack), [filteredQ]);
  const filteredSelectedCount = eligibleFiltered.filter((q) => picked[q.itemId]).length;
  const allFilteredSelected =
    eligibleFiltered.length > 0 && filteredSelectedCount === eligibleFiltered.length;
  const someFilteredSelected = filteredSelectedCount > 0 && !allFilteredSelected;

  const remaining = data?.remaining ?? 0;
  const overCapacity = pickedIds.length > remaining;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

  // ── Add flows ──────────────────────────────────────────────────────
  const runAdd = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
    clear: () => void,
  ) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      clear();
      setData(null); // trigger the lazy re-load (pool + badges changed)
      onChanged();
      setNotice(successMsg);
    });
  };

  const addSelectedStandalones = () => {
    if (pickedIds.length === 0) return;
    const n = pickedIds.length;
    runAdd(
      () => addPackStandalonesAction(packId, pickedIds, insertAt?.linkId ?? null),
      `Added ${n} question${n === 1 ? '' : 's'} — they are reserved now and hidden from the practice pool.`,
      () => setPicked({}),
    );
  };

  const addCase = (c: PickerCase) => {
    if (c.inPack) return;
    runAdd(
      () => addPackCaseAction(packId, c.caseId, insertAt?.linkId ?? null),
      `Added case study ${c.caseId} (${c.childCount} questions) as one unit — its questions are reserved now.`,
      () => undefined,
    );
  };

  const addTrendSelection = (t: PickerTrend) => {
    const ids = t.children
      .filter((c) => trendPicked[c.itemId] && !c.inPack)
      .map((c) => c.itemId);
    if (ids.length === 0) return;
    runAdd(
      () => addPackTrendQuestionsAction(packId, t.trendId, ids, insertAt?.linkId ?? null),
      `Added ${ids.length} question${ids.length === 1 ? '' : 's'} from trend ${t.trendId} — they are reserved now.`,
      () =>
        setTrendPicked((p) => {
          const next = { ...p };
          for (const id of ids) delete next[id];
          return next;
        }),
    );
  };

  // Tick / untick every filtered eligible row at once, capping the add so the
  // global selection never exceeds the pack's free positions.
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setPicked((p) => {
        const next = { ...p };
        for (const q of eligibleFiltered) next[q.itemId] = false;
        return next;
      });
      return;
    }
    const slotsLeft = remaining - pickedIds.length;
    if (slotsLeft <= 0) {
      setNotice(
        `No room left — the ${remaining} position${remaining === 1 ? '' : 's'} this pack has ${
          remaining === 1 ? 'is' : 'are'
        } already selected. Add them, or free up space first.`,
      );
      return;
    }
    const toAdd = eligibleFiltered.filter((q) => !picked[q.itemId]);
    const capped = toAdd.slice(0, slotsLeft);
    setPicked((p) => {
      const next = { ...p };
      for (const q of capped) next[q.itemId] = true;
      return next;
    });
    if (capped.length < toAdd.length) {
      setNotice(
        `Selected ${capped.length} to fill the pack — ${toAdd.length - capped.length} more match this filter but only ${remaining} position${
          remaining === 1 ? '' : 's'
        } remain.`,
      );
    }
  };

  if (!open) return null;

  // ── Facet popover (shared render for both panes) ──────────────────
  const facetPanel = (
    defs: FacetDef[],
    state: FacetState,
    setState: (f: FacetState) => void,
  ) => (
    <div className="rp-pk-facet-panel">
      <div className="rp-pk-facet-grid">
        {defs.map((d) => {
          const sel = state[d.key] ?? [];
          const summary =
            sel.length === 0 ? 'All' : sel.length === 1 ? sel[0] : `${sel.length} selected`;
          return (
            <div key={d.key} className="rp-pk-facet">
              <span className="rp-pk-facet-label">{d.label}</span>
              <button
                type="button"
                className={`rp-pk-facet-btn ${sel.length ? 'has' : ''}`}
                onClick={() => setMsOpen(msOpen === d.key ? null : d.key)}
              >
                <span>{summary}</span>
                <span className="rp-pk-caret">▾</span>
              </button>
              {msOpen === d.key && (
                <div className="rp-pk-facet-menu">
                  {d.opts.map((o) => (
                    <label key={o}>
                      <input
                        type="checkbox"
                        checked={sel.includes(o)}
                        onChange={() =>
                          setState({
                            ...state,
                            [d.key]: sel.includes(o)
                              ? sel.filter((x) => x !== o)
                              : [...sel, o],
                          })
                        }
                      />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="rp-pk-facet-foot">
        <button
          type="button"
          className="rp-pk-link"
          onClick={() => {
            setState(emptyFacets(defs));
            setMsOpen(null);
          }}
        >
          Reset all filters
        </button>
        <button
          type="button"
          className="rp-btn-primary"
          onClick={() => {
            setFacetsOpen(false);
            setMsOpen(null);
          }}
        >
          Done
        </button>
      </div>
    </div>
  );

  const chipsOf = (defs: FacetDef[], state: FacetState, setState: (f: FacetState) => void) =>
    defs.flatMap((d) =>
      (state[d.key] ?? []).map((v) => (
        <button
          key={`${d.key}:${v}`}
          type="button"
          className="rp-pk-chip"
          title="Remove this filter"
          onClick={() =>
            setState({ ...state, [d.key]: state[d.key].filter((x) => x !== v) })
          }
        >
          <span>{v}</span>
          <span className="rp-pk-chip-x">×</span>
        </button>
      )),
    );

  const isWrapTab = tab === 'case' || tab === 'trend';
  const wDefs: FacetDef[] = [
    { key: 'subcat', label: 'Client Needs', opts: SUBCATS },
    { key: 'sys',    label: 'Body system',  opts: BODY_SYSTEMS },
    ...(tab === 'trend'
      ? [{ key: 'nq', label: 'Questions per trend', opts: trendNqOpts } as FacetDef]
      : []),
  ];
  const qChips = chipsOf(qDefs, qFacets, setQFacets);
  const wChips = chipsOf(wDefs, wFacets, setWFacets);

  const remainLabel = data
    ? `${data.remaining} position${data.remaining === 1 ? '' : 's'} remaining`
    : '…';

  return (
    <div className="rp-pk-root">
      <div className="rp-pk-backdrop" onClick={onClose} />
      <div className="rp-pk-panel" role="dialog" aria-label="Add questions">
        {/* Header */}
        <div className="rp-pk-head">
          <div className="rp-pk-head-top">
            <div>
              <h3>Add questions — {packTitle}</h3>
              <span className="rp-pk-sub">
                Only published, unassigned questions are offered · {remainLabel}
              </span>
            </div>
            <button type="button" className="rp-pk-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="rp-pk-insert-row">
            <span className="rp-pk-insert-pill">
              {insertAt ? `Inserting at position ${insertAt.pos}` : 'Adding to the end'}
            </span>
            {insertAt && (
              <button type="button" className="rp-pk-link" onClick={onSwitchToEnd}>
                switch to end
              </button>
            )}
          </div>
          <div className="rp-pk-tabs">
            {(
              [
                { key: 'q',     label: `Standalone${data ? ` (${data.standalones.length})` : ''}` },
                { key: 'case',  label: `Case studies${data ? ` (${data.cases.length})` : ''}` },
                { key: 'trend', label: `Trends${data ? ` (${data.trends.length})` : ''}` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? 'active' : ''}
                onClick={() => {
                  setTab(t.key);
                  setFacetsOpen(false);
                  setMsOpen(null);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toolbar: search + facets */}
        <div className="rp-pk-toolbar">
          <div className="rp-pk-search-row">
            <input
              value={isWrapTab ? wSearch : qSearch}
              onChange={(e) =>
                isWrapTab ? setWSearch(e.target.value) : setQSearch(e.target.value)
              }
              placeholder={
                tab === 'q'
                  ? 'Search stem or ID…'
                  : tab === 'case'
                    ? 'Search case title or ID…'
                    : 'Search trend title, ID or question ID…'
              }
            />
            <button
              type="button"
              className={`rp-pk-filters-btn ${(isWrapTab ? wChips : qChips).length ? 'has' : ''}`}
              onClick={() => {
                setFacetsOpen(!facetsOpen);
                setMsOpen(null);
              }}
            >
              Filters
              {(isWrapTab ? wChips : qChips).length > 0 && (
                <span className="rp-pk-filters-badge">
                  {(isWrapTab ? wChips : qChips).length}
                </span>
              )}
              <span className="rp-pk-caret">▾</span>
            </button>
          </div>
          {(isWrapTab ? wChips : qChips).length > 0 && (
            <div className="rp-pk-chips">
              {isWrapTab ? wChips : qChips}
              <button
                type="button"
                className="rp-pk-link"
                onClick={() =>
                  isWrapTab
                    ? setWFacets({ subcat: [], sys: [], nq: [] })
                    : setQFacets(emptyFacets(qDefs))
                }
              >
                Clear all
              </button>
            </div>
          )}
          {facetsOpen &&
            (isWrapTab
              ? facetPanel(wDefs, wFacets, setWFacets)
              : facetPanel(qDefs, qFacets, setQFacets))}
        </div>

        {/* Body */}
        <div className="rp-pk-body">
          {loadError !== null && (
            <div className="rp-pk-empty">
              {loadError}{' '}
              <button type="button" className="rp-pk-link" onClick={() => setLoadError(null)}>
                Retry
              </button>
            </div>
          )}
          {loadError === null && data === null && (
            <div className="rp-pk-empty">Loading questions…</div>
          )}

          {data !== null && tab === 'q' && (
            <>
              {filteredQ.length === 0 && (
                <div className="rp-pk-empty">No questions match these filters.</div>
              )}
              {eligibleFiltered.length > 0 && (
                <label className="rp-pk-selectall">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                  />
                  <span>
                    {allFilteredSelected ? 'Deselect all' : 'Select all'} ({eligibleFiltered.length})
                    {qChips.length > 0 || qSearch.trim() ? ' in this filter' : ''}
                  </span>
                  {pickedIds.length > 0 && (
                    <span className="rp-pk-selectall-count">
                      {pickedIds.length} selected · {remaining} position{remaining === 1 ? '' : 's'} free
                    </span>
                  )}
                </label>
              )}
              {filteredQ.map((q) => (
                <QuestionRow
                  key={q.itemId}
                  q={q}
                  picked={!!picked[q.itemId]}
                  onToggle={() => setPicked((p) => ({ ...p, [q.itemId]: !p[q.itemId] }))}
                />
              ))}
            </>
          )}

          {data !== null && tab === 'case' && (
            <>
              <p className="rp-pk-intro">
                A case study joins the pack as one unit of 6 questions at consecutive
                positions, in CJMM slot order.
              </p>
              {filteredCases.length === 0 && (
                <div className="rp-pk-empty">No case studies match these filters.</div>
              )}
              {filteredCases.map((c) => (
                <div key={c.caseId} className={`rp-pk-wrap-row ${c.inPack ? 'off' : ''}`}>
                  <div className="rp-pk-wrap-main">
                    <div className="rp-row-chips">
                      <span className="rp-kind-chip case">CASE STUDY</span>
                      <span className="rp-mono">{c.caseId}</span>
                      {c.inPack && <span className="rp-pk-badge">In {c.inPack}</span>}
                    </div>
                    <div className="rp-pk-wrap-title">{c.title}</div>
                    <div className="rp-pk-wrap-preview">
                      {c.childCount} questions · {c.childTypes.join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rp-pk-add-btn"
                    disabled={!!c.inPack || pending}
                    onClick={() => addCase(c)}
                  >
                    {c.inPack ? 'Unavailable' : `Add case (${c.childCount} questions)`}
                  </button>
                </div>
              ))}
            </>
          )}

          {data !== null && tab === 'trend' && (
            <>
              <p className="rp-pk-intro">
                Pick the trend questions you want — they land together at the insertion
                point, and you can add the rest later, anywhere.
              </p>
              {filteredTrends.length === 0 && (
                <div className="rp-pk-empty">No trends match these filters.</div>
              )}
              {filteredTrends.map((t) => (
                <TrendRow
                  key={t.trendId}
                  t={t}
                  expanded={!!expandedTrends[t.trendId]}
                  onToggle={() =>
                    setExpandedTrends((e) => ({ ...e, [t.trendId]: !e[t.trendId] }))
                  }
                  picked={trendPicked}
                  setPicked={setTrendPicked}
                  pending={pending}
                  onAdd={() => addTrendSelection(t)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="rp-pk-foot">
          <p>
            Added questions are reserved: they leave the student practice pool
            automatically, and stay reserved even if removed later.
          </p>
          {tab === 'q' && (
            <>
              {overCapacity && (
                <span className="rp-pk-cap-warn">
                  {pickedIds.length} selected · only {remaining} fit — deselect{' '}
                  {pickedIds.length - remaining}
                </span>
              )}
              {pickedIds.length > 0 && (
                <button
                  type="button"
                  className="rp-pk-link"
                  disabled={pending}
                  onClick={() => setPicked({})}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="rp-btn-primary"
                disabled={pickedIds.length === 0 || pending || overCapacity}
                onClick={addSelectedStandalones}
              >
                {pickedIds.length === 0 ? 'Add selected' : `Add ${pickedIds.length} selected`}
              </button>
            </>
          )}
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <InfoToast message={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

// ── Row pieces ──────────────────────────────────────────────────────

function QuestionRow({
  q,
  picked,
  onToggle,
}: {
  q: PickerQuestion;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className={`rp-pk-q-row ${q.inPack ? 'off' : ''}`}>
      <input
        type="checkbox"
        checked={picked && !q.inPack}
        disabled={!!q.inPack}
        onChange={onToggle}
      />
      <div className="rp-pk-q-main">
        <div className="rp-row-chips">
          <span className="rp-mono">{q.itemId}</span>
          <span className="rp-type-chip">{q.questionType}</span>
          {q.difficulty && (
            <span className={`rp-diff ${DIFF_CLASS[q.difficulty] ?? ''}`}>{q.difficulty}</span>
          )}
          {q.subcategory && <span className="rp-dim">{q.subcategory}</span>}
          {q.inPack && <span className="rp-pk-badge">In {q.inPack}</span>}
        </div>
        {q.stemLabel && <div className="rp-pk-stem">{q.stemLabel}</div>}
      </div>
    </label>
  );
}

function TrendRow({
  t,
  expanded,
  onToggle,
  picked,
  setPicked,
  pending,
  onAdd,
}: {
  t: PickerTrend;
  expanded: boolean;
  onToggle: () => void;
  picked: Record<string, boolean>;
  setPicked: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  pending: boolean;
  onAdd: () => void;
}) {
  const enabled = t.children.filter((c) => !c.inPack);
  const k = enabled.filter((c) => picked[c.itemId]).length;
  const allPicked = enabled.length > 0 && k === enabled.length;
  const noneAvailable = enabled.length === 0;

  return (
    <div className={`rp-pk-trend ${noneAvailable ? 'off' : ''}`}>
      <div className="rp-pk-wrap-row head">
        <button
          type="button"
          className="rp-unit-chev"
          title="Show questions"
          onClick={onToggle}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="rp-pk-wrap-main">
          <div className="rp-row-chips">
            <span className="rp-kind-chip trend">TREND</span>
            <span className="rp-mono">{t.trendId}</span>
            {noneAvailable && <span className="rp-pk-badge">All placed</span>}
          </div>
          <div className="rp-pk-wrap-title">{t.title}</div>
          <div className="rp-pk-wrap-preview">
            {t.children.length} question{t.children.length === 1 ? '' : 's'} ·{' '}
            {t.children.map((c) => c.questionType).join(' · ')}
          </div>
        </div>
        <button
          type="button"
          className="rp-pk-add-btn"
          disabled={k === 0 || pending}
          title={
            noneAvailable
              ? 'Every question of this trend is already in a pack'
              : 'Adds the ticked questions together at the insertion point'
          }
          onClick={onAdd}
        >
          {noneAvailable ? 'Unavailable' : k === 0 ? 'Add selected' : `Add ${k} selected`}
        </button>
      </div>
      {expanded && (
        <div className="rp-pk-trend-children">
          {enabled.length > 1 && (
            <label className="rp-pk-trend-all">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() =>
                  setPicked((p) => {
                    const next = { ...p };
                    for (const c of enabled) next[c.itemId] = !allPicked;
                    return next;
                  })
                }
              />
              <span>Select all available</span>
            </label>
          )}
          {t.children.map((c) => (
            <label key={c.itemId} className={`rp-pk-q-row child ${c.inPack ? 'off' : ''}`}>
              <input
                type="checkbox"
                checked={!!picked[c.itemId] && !c.inPack}
                disabled={!!c.inPack}
                onChange={() => setPicked((p) => ({ ...p, [c.itemId]: !p[c.itemId] }))}
              />
              <div className="rp-pk-q-main">
                <div className="rp-row-chips">
                  <span className="rp-mono">{c.itemId}</span>
                  <span className="rp-type-chip">{c.questionType}</span>
                  {c.difficulty && (
                    <span className={`rp-diff ${DIFF_CLASS[c.difficulty] ?? ''}`}>
                      {c.difficulty}
                    </span>
                  )}
                  {c.subcategory && <span className="rp-dim">{c.subcategory}</span>}
                  {c.inPack && (
                    <span className={`rp-pk-badge ${c.inPack === 'this pack' ? 'here' : ''}`}>
                      In {c.inPack}
                    </span>
                  )}
                </div>
                {c.stemLabel && <div className="rp-pk-stem">{c.stemLabel}</div>}
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
