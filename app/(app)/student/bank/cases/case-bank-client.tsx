// mynclex/app/(app)/student/bank/cases/case-bank-client.tsx
//
// The interactive Case Study bank: a grouped list on the left, a "Your
// run" rail on the right, and a phone-only sticky launch bar.
//
// Design notes worth keeping (they were decisions, not defaults):
//
//   · A row carries the title and the clinical axes, and nothing else.
//     No question count — every case is six, so it was the same string on
//     all 93 rows. No difficulty word — the average case spans ~1.9
//     logits between its easiest and hardest question, so one label per
//     case would misrepresent it. No raw tags — that column holds curator
//     vocabulary (`synthetic`, `CATPREP`, `Maryland`), and one value,
//     `readiness`, would have revealed which cases are pack members.
//
//   · The scenario is behind a per-row expand rather than printed on
//     every row: it is what you actually choose a case on, but 93 of them
//     inline is a phone-hostile page.
//
//   · A locked row says "Not available" and NOTHING about why (Sam,
//     2026-07-29 — the student must not learn our CAT pool / readiness
//     reservation exists). There is no reason in the payload either, so
//     there is nothing here to accidentally render. The whole locked
//     group is collapsed by default; on dev it is 56–69 of 93 rows, and
//     it should not be the bulk of the page.
//
//   · The rail shows filled slots only. An empty "Case 2" placeholder
//     reads as an obligation, and one case is a legitimate run.

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createCaseAttemptAction } from '@/lib/practice/cases/actions';
import {
  MODE_NOTE,
  formatAttemptDate,
  groupCases,
  runHint,
  runQuestionCount,
  scoreTone,
} from '@/lib/practice/cases/derive';
import {
  MAX_CASES_PER_RUN,
  type CaseBankMode,
  type CaseBankRow,
  type CaseFilterId,
} from '@/lib/practice/cases/types';

const FILTERS: { id: CaseFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'Not attempted' },
  { id: 'done', label: 'Attempted' },
];

const MODES: { id: CaseBankMode; label: string }[] = [
  { id: 'UNTIMED_LEARNING', label: 'Learning' },
  { id: 'UNTIMED_TEST', label: 'Untimed practice' },
  { id: 'TIMED_FREE_NAV', label: 'Timed practice' },
];

export function CaseBankClient({ rows }: { rows: CaseBankRow[] }) {
  const router = useRouter();

  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CaseFilterId>('all');
  const [mode, setMode] = useState<CaseBankMode>('UNTIMED_LEARNING');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();

  const groups = useMemo(() => groupCases(rows, query, filter), [rows, query, filter]);

  const byId = useMemo(
    () => new Map(rows.map((r) => [r.caseId, r])),
    [rows],
  );

  const picked = useMemo(
    () => selected.map((id) => byId.get(id)).filter((r): r is CaseBankRow => !!r),
    [selected, byId],
  );

  const qCount = runQuestionCount(picked.length);
  const reattempts = picked.filter((r) => r.seen).length;
  const full = selected.length >= MAX_CASES_PER_RUN;

  // The cap decision is made OUT here, not inside a setSelected updater.
  // Raising the toast from within the updater looked right and silently
  // did nothing: returning `prev` unchanged makes React bail out of the
  // re-render, and an updater must be pure anyway (StrictMode calls it
  // twice). Caught by clicking a third case — tsc and the suite both
  // stayed green.
  function toggle(r: CaseBankRow) {
    if (r.locked) return;
    if (selected.includes(r.caseId)) {
      setSelected((prev) => prev.filter((x) => x !== r.caseId));
      return;
    }
    if (selected.length >= MAX_CASES_PER_RUN) {
      setError(`You can sit up to ${MAX_CASES_PER_RUN} cases at a time — remove one to swap.`);
      return;
    }
    setSelected((prev) => [...prev, r.caseId]);
  }

  function start() {
    if (!selected.length || starting) return;
    startTransition(async () => {
      const res = await createCaseAttemptAction({ caseIds: selected, mode });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/session/${res.attemptId}`);
    });
  }

  const startLabel = starting
    ? 'Starting…'
    : selected.length
      ? `Start ${qCount} question${qCount === 1 ? '' : 's'}`
      : 'Add a case to start';

  return (
    <div className="cb-page">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      <div className="cb-layout">
        <div className="cb-main">
          <div className="cb-eyebrow">Next Generation NCLEX</div>
          <h1 className="cb-title">Case Studies</h1>
          <p className="cb-lede">
            Sit an unfolding case straight from the bank. Every case is six
            questions across the clinical judgement steps — add a second for a
            twelve-question run.
          </p>

          <div className="cb-controls">
            <input
              type="search"
              className="cb-search"
              placeholder="Search cases"
              aria-label="Search cases"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="cb-segment" role="group" aria-label="Filter by attempt state">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`cb-seg-btn${filter === f.id ? ' on' : ''}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 && (
            <p className="cb-empty">No cases match that search.</p>
          )}

          {groups.map((g) => {
            const isLockedGroup = g.key === 'unavailable';
            const collapsed = isLockedGroup && !showLocked;

            return (
              <section className="cb-group" key={g.key}>
                <div className="cb-group-head">
                  <h2 className="cb-group-title">{g.title}</h2>
                  <span className="cb-group-count">{g.rows.length}</span>
                  {isLockedGroup && (
                    <button
                      type="button"
                      className="cb-group-toggle"
                      aria-expanded={showLocked}
                      onClick={() => setShowLocked((v) => !v)}
                    >
                      {showLocked ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>

                {!collapsed &&
                  g.rows.map((r) => {
                    const isSel = selected.includes(r.caseId);
                    const blocked = !r.locked && !isSel && full;
                    const isOpen = expanded === r.caseId;
                    const date = formatAttemptDate(r.last?.endedAt);

                    return (
                      <div
                        key={r.caseId}
                        className={[
                          'cb-row',
                          isSel ? 'sel' : '',
                          r.locked ? 'locked' : '',
                          blocked ? 'blocked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className="cb-row-line">
                          <button
                            type="button"
                            className="cb-check"
                            aria-label={
                              r.locked
                                ? `${r.title} — not available`
                                : isSel
                                  ? `Remove ${r.title} from your run`
                                  : `Add ${r.title} to your run`
                            }
                            aria-pressed={!r.locked && isSel}
                            disabled={r.locked}
                            onClick={() => toggle(r)}
                          >
                            {r.locked ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                                strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            ) : isSel ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
                                strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : null}
                          </button>

                          <div className="cb-row-body">
                            <div className="cb-row-titleline">
                              <span className="cb-row-title">{r.title}</span>
                              {r.locked && (
                                <span className="cb-badge">Not available</span>
                              )}
                              {!r.locked && r.seen && !r.last && (
                                <span className="cb-badge">In progress</span>
                              )}
                            </div>
                            {r.axes && <div className="cb-row-axes">{r.axes}</div>}
                          </div>

                          <div className="cb-row-actions">
                            {r.last && (
                              <div className="cb-score">
                                <span className={`cb-score-pct ${scoreTone(r.last.pct)}`}>
                                  {r.last.pct}%
                                </span>
                                {date && <span className="cb-score-date">{date}</span>}
                              </div>
                            )}
                            {r.last && (
                              <Link
                                className="cb-btn ghost"
                                href={`/session/${r.last.attemptId}`}
                              >
                                Review
                              </Link>
                            )}
                            {!r.locked && r.seen && (
                              <button
                                type="button"
                                className={`cb-btn${isSel ? ' ghost' : ' solid'}`}
                                onClick={() => toggle(r)}
                              >
                                {isSel ? 'Added' : 'Reattempt'}
                              </button>
                            )}
                            {r.snippet && (
                              <button
                                type="button"
                                className="cb-expand"
                                aria-expanded={isOpen}
                                aria-label={
                                  isOpen
                                    ? `Hide the scenario for ${r.title}`
                                    : `Show the scenario for ${r.title}`
                                }
                                onClick={() => setExpanded(isOpen ? null : r.caseId)}
                              >
                                {isOpen ? '▴' : '▾'}
                              </button>
                            )}
                          </div>
                        </div>

                        {isOpen && r.snippet && (
                          <p className="cb-scenario">{r.snippet}</p>
                        )}
                      </div>
                    );
                  })}
              </section>
            );
          })}
        </div>

        <aside className="cb-rail" aria-label="Your run">
          <div className="cb-rail-head">Your run</div>

          {picked.length === 0 ? (
            <p className="cb-rail-empty">Nothing added yet.</p>
          ) : (
            <ul className="cb-slots">
              {picked.map((r) => (
                <li className="cb-slot" key={r.caseId}>
                  <span className="cb-slot-title">{r.title}</span>
                  <button
                    type="button"
                    className="cb-slot-x"
                    aria-label={`Remove ${r.title} from your run`}
                    onClick={() =>
                      setSelected((prev) => prev.filter((x) => x !== r.caseId))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="cb-qcount">
            <span className="cb-qcount-n">{qCount}</span>
            <span className="cb-qcount-label">
              question{qCount === 1 ? '' : 's'} in this run
            </span>
          </div>

          <label className="cb-mode-label" htmlFor="cb-mode">Mode</label>
          <select
            id="cb-mode"
            className="cb-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as CaseBankMode)}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <p className="cb-mode-note">{MODE_NOTE[mode]}</p>

          <button
            type="button"
            className="cb-start"
            disabled={!selected.length || starting}
            onClick={start}
          >
            {startLabel}
          </button>
          <p className="cb-hint">{runHint(picked.length, reattempts)}</p>
        </aside>
      </div>

      {/* Phone-only launch strip. Rendered always and hidden above 768px by
          CSS rather than a JS width check — the open/closed state cannot be
          known at render time on the server. Same reasoning as the practice
          builder's mobile-launch-bar. */}
      <div className="cb-mobile-bar">
        <div className="cb-mobile-figure">
          <span className="cb-mobile-n">{qCount}</span>
          <span className="cb-mobile-unit">
            {picked.length === 0
              ? 'no cases added'
              : `question${qCount === 1 ? '' : 's'} · ${picked.length} case${picked.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <button
          type="button"
          className="cb-start compact"
          disabled={!selected.length || starting}
          onClick={start}
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  );
}
