// mynclex/lib/bank/cat-pool/reserve-drawer.tsx
//
// The reserve drawer (Slice 10b2-d) — the surface that actually grows the
// pool. Right-hand slide-over: three tabs of candidate stock, six facets, and
// a commit.
//
// TWO of the three tabs list QUESTIONS ticked one at a time — free standalone
// rows, and trend questions. Only "Cases" lists something reserved whole,
// because a case is the one thing the exam draws as a block. A trend dataset
// is not a reservation unit at all (the exam picks trend questions
// individually, one per dataset per sitting), so its questions are offered the
// same way any other question is, with the dataset shown only as context.
//
// Opened via ?reserve=1 rather than client state, so the candidate set is
// only loaded when it is wanted, and Back closes it.
//
// Filtering runs across the WHOLE candidate set client-side, and only the
// first RENDER_CAP matches are drawn — filtering a fetched page would
// silently search that page, which is the dishonesty the stock pane's "N of
// M" counter exists to avoid.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { InfoToast } from '@/lib/toast/info-toast';
import { ErrorToast } from '@/lib/toast/error-toast';
import { reserveToCatPool } from './actions';
import {
  FACET_DEFS,
  EMPTY_FACETS,
  facetChips,
  facetCount,
  facetSummary,
  hasAnyFacet,
  toggleFacet,
  filterQuestions,
  filterTrendQuestions,
  filterWrappers,
  selectableIds,
  allSelected,
  commitLabel,
  isBlocked,
  isCaseBlocked,
  caseBlockReason,
  BLOCKED_BADGE,
  BLOCKED_NOTE,
  UNPLACEABLE_BADGE,
  type CandidateTab,
  type CandidateQuestion,
  type CandidateWrapper,
  type Facets,
  type FacetKey,
} from './candidates';

/** Rows drawn at once. Filtering still runs over everything. */
const RENDER_CAP = 100;

export function ReserveDrawer({
  questions,
  cases,
  trendQuestions,
  closeHref,
}: {
  questions: CandidateQuestion[];
  cases: CandidateWrapper[];
  trendQuestions: CandidateQuestion[];
  closeHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<CandidateTab>('questions');
  const [search, setSearch] = useState('');
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => router.push(closeHref, { scroll: false });

  const filteredQ = useMemo(
    () => filterQuestions(questions, facets, search),
    [questions, facets, search],
  );
  const filteredTrendQ = useMemo(
    () => filterTrendQuestions(trendQuestions, facets, search),
    [trendQuestions, facets, search],
  );
  const filteredCases = useMemo(() => filterWrappers(cases, search), [cases, search]);

  // Both question tabs behave identically — the only difference is which list
  // they draw from and whether a dataset chip shows on the row.
  const isCases = tab === 'cases';
  const isQuestions = !isCases;
  const rows = tab === 'trends' ? filteredTrendQ : filteredQ;

  const matches = isCases ? filteredCases.length : rows.length;
  const drawnQ = rows.slice(0, RENDER_CAP);
  const drawnW = filteredCases.slice(0, RENDER_CAP);

  const visibleSelectable = isCases
    ? drawnW.filter((x) => !isCaseBlocked(x)).map((x) => x.wrapperId)
    : selectableIds(drawnQ);
  const everySelected = allSelected(visibleSelectable, picked);

  const toggleOne = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (everySelected) visibleSelectable.forEach((id) => next.delete(id));
      else visibleSelectable.forEach((id) => next.add(id));
      return next;
    });

  const commit = () => {
    // Every picked id resolved back to its kind, so a case is written to its
    // own table rather than being guessed at from the id prefix. Trend
    // questions are plain items — there is no trend target any more.
    const targets = [
      ...questions.filter((x) => picked.has(x.itemId)).map((x) => ({ kind: 'item' as const, id: x.itemId })),
      ...trendQuestions.filter((x) => picked.has(x.itemId)).map((x) => ({ kind: 'item' as const, id: x.itemId })),
      ...cases.filter((x) => picked.has(x.wrapperId)).map((x) => ({ kind: 'case' as const, id: x.wrapperId })),
    ];

    startTransition(async () => {
      const res = await reserveToCatPool(targets);
      if (res.ok) {
        setNotice(
          `Reserved ${res.reserved}` + (res.skipped ? ` — ${res.skipped} were skipped.` : '.'),
        );
        setPicked(new Set());
        router.push(closeHref, { scroll: false });
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const chips = facetChips(facets);

  return (
    <div className="cp-drawer-root">
      <div className="cp-drawer-scrim" onClick={close} aria-hidden="true" />

      <div className="cp-drawer" role="dialog" aria-label="Reserve questions for CAT" aria-modal="true">
        <div className="cp-drawer-head">
          <div className="cp-drawer-titlerow">
            <div>
              <h3>Reserve questions for CAT</h3>
              <span className="cp-subhead">Published, practice-eligible stock only · admin bank</span>
            </div>
            <button type="button" className="cp-drawer-x" onClick={close} aria-label="Close">
              ×
            </button>
          </div>

          <div className="cp-drawer-pillrow">
            <span className="cp-chip is-case">CAT pool</span>
            <span className="cp-subhead">flat membership — no order, no positions</span>
          </div>

          <div className="cp-drawer-tabs">
            <button
              type="button"
              className={tab === 'questions' ? 'is-on' : ''}
              onClick={() => setTab('questions')}
            >
              Standalone <span>{questions.length.toLocaleString()}</span>
            </button>
            <button type="button" className={isCases ? 'is-on' : ''} onClick={() => setTab('cases')}>
              Cases <span>{cases.length}</span>
            </button>
            <button type="button" className={tab === 'trends' ? 'is-on' : ''} onClick={() => setTab('trends')}>
              Trend questions <span>{trendQuestions.length.toLocaleString()}</span>
            </button>
          </div>
        </div>

        <div className="cp-drawer-filters">
          <div className="cp-drawer-searchrow">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'cases'
                  ? 'Search case ID or title…'
                  : tab === 'trends'
                    ? 'Search stem, ID or dataset…'
                    : 'Search stem or ID…'
              }
              aria-label="Search candidates"
            />
            {isQuestions && (
              <button type="button" className="cp-facet-toggle" onClick={() => setFacetsOpen((v) => !v)}>
                Filters
                {hasAnyFacet(facets) && <span className="cp-facet-n">{facetCount(facets)}</span>}
                <span aria-hidden="true">▾</span>
              </button>
            )}
          </div>

          {isQuestions && chips.length > 0 && (
            <div className="cp-facet-chips">
              {chips.map((c) => (
                <button
                  key={`${c.key}:${c.value}`}
                  type="button"
                  title="Remove this filter"
                  onClick={() => setFacets((f) => toggleFacet(f, c.key, c.value))}
                >
                  <span>{c.label}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              <button type="button" className="cp-link-btn" onClick={() => setFacets(EMPTY_FACETS)}>
                Clear all
              </button>
            </div>
          )}

          {isQuestions && facetsOpen && (
            <div className="cp-facet-panel">
              <div className="cp-facet-grid">
                {FACET_DEFS.map((f) => (
                  <div key={f.key} className="cp-facet">
                    <span className="cp-facet-label">{f.label}</span>
                    <button
                      type="button"
                      className="cp-facet-open"
                      onClick={() => setOpenFacet((k) => (k === f.key ? null : f.key))}
                    >
                      <span>{facetSummary(facets, f.key)}</span>
                      <span aria-hidden="true">▾</span>
                    </button>
                    {openFacet === f.key && (
                      <div className="cp-facet-options">
                        {f.options.map((o) => (
                          <label key={o}>
                            <input
                              type="checkbox"
                              checked={facets[f.key].includes(o)}
                              onChange={() => setFacets((cur) => toggleFacet(cur, f.key, o))}
                            />
                            <span>{f.short?.[o] ?? o}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="cp-facet-foot">
                <button type="button" className="cp-link-btn" onClick={() => setFacets(EMPTY_FACETS)}>
                  Reset all filters
                </button>
                <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setFacetsOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="cp-drawer-body">
          {matches === 0 ? (
            <p className="cp-empty">Nothing matches these filters.</p>
          ) : isQuestions ? (
            <>
              {tab === 'trends' && (
                <p className="cp-note">
                  Trend questions are reserved one at a time, like any other question — a dataset
                  is not a unit the exam draws. Reserving one leaves the others on the same chart
                  in student practice.
                </p>
              )}

              <label className="cp-selectall">
                <input type="checkbox" checked={everySelected} onChange={toggleAll} />
                <span>Select all shown</span>
                <span className="cp-subhead">
                  {matches > RENDER_CAP
                    ? `showing ${RENDER_CAP} of ${matches.toLocaleString()} — narrow to see the rest`
                    : `${matches.toLocaleString()} match`}
                </span>
              </label>

              {drawnQ.map((q) => {
                const blocked = isBlocked(q);
                return (
                  <label key={q.itemId} className={`cp-cand${blocked ? ' is-blocked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={picked.has(q.itemId)}
                      disabled={blocked}
                      onChange={() => toggleOne(q.itemId)}
                    />
                    <div className="cp-cand-body">
                      <div className="cp-row-top">
                        <code className="cp-row-id">{q.itemId}</code>
                        <span className="cp-type">{q.questionType}</span>
                        {q.difficulty && <span className="cp-diff">{q.difficulty}</span>}
                        {q.subcategory && <span className="cp-subcat">{q.subcategory}</span>}
                        {q.trendId && (
                          <span className="cp-chip is-trend" title={q.trendTitle ?? q.trendId}>
                            {q.trendId}
                          </span>
                        )}
                        {blocked && <span className="cp-warn is-readiness">{BLOCKED_BADGE}</span>}
                      </div>
                      <div className="cp-row-stem">{q.stem || <em>No stem text</em>}</div>
                      {blocked && <div className="cp-cand-blocked">{BLOCKED_NOTE}</div>}
                    </div>
                  </label>
                );
              })}
            </>
          ) : (
            <>
              <p className="cp-note">
                A case is reserved whole — every published question in it joins the pool, and the
                database keeps them in step. There is no per-question tick inside a case.
              </p>
              {drawnW.map((w) => {
                const blocked = isCaseBlocked(w);
                const reason = caseBlockReason(w);
                return (
                  <label key={w.wrapperId} className={`cp-cand${blocked ? ' is-blocked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={picked.has(w.wrapperId)}
                      disabled={blocked}
                      onChange={() => toggleOne(w.wrapperId)}
                    />
                    <div className="cp-cand-body">
                      <div className="cp-row-top">
                        <span className="cp-chip is-case">Case</span>
                        <code className="cp-row-id">{w.wrapperId}</code>
                        {w.readinessTagged && (
                          <span className="cp-warn is-readiness">{BLOCKED_BADGE}</span>
                        )}
                        {!w.readinessTagged && w.unplaceableChildren > 0 && (
                          <span className="cp-warn is-draft">{UNPLACEABLE_BADGE}</span>
                        )}
                      </div>
                      <div className="cp-cand-title">{w.title || <em>Untitled</em>}</div>
                      <div className="cp-row-stem">
                        {w.childCount} published question{w.childCount === 1 ? '' : 's'}
                        {w.bands.length ? ` · ${w.bands.join(', ')}` : ' · no difficulty set'}
                      </div>
                      {reason && <div className="cp-cand-blocked">{reason}</div>}
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>

        <div className="cp-drawer-foot">
          <p>
            Reserving writes the CAT-pool flag: questions on their own row — standalone and
            trend-linked alike — and cases on the wrapper, which carries its questions with it.
          </p>
          {picked.size > 0 && (
            <button type="button" className="cp-link-btn" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="cp-btn cp-btn--primary"
            disabled={picked.size === 0 || isPending}
            onClick={commit}
          >
            {isPending ? 'Reserving…' : commitLabel(picked.size)}
          </button>
        </div>
      </div>

      <InfoToast message={notice} onDismiss={() => setNotice(null)} />
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
