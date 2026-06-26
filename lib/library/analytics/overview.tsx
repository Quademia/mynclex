// mynclex/lib/library/analytics/overview.tsx
//
// The tutor "Question analytics" Overview (slice 11.11c, Slice 1). A
// presentational server component over getEmbedAnalyticsOverview():
//   • the reading-lens legend
//   • a KPI strip
//   • the cross-note "Re-teach signal" (most-missed questions)
//   • the "Notes with embedded questions" table (weakest block flagged)
//
// Concept from the CD "Question analytics" prototype, rebuilt in the app
// shell. The scope switcher (All / cohort / self-paced) and the per-note
// drill-in (Questions / Roster / Readers) land in later slices.

import Link from 'next/link';
import { tierOf, type EmbedAnalyticsOverview } from './types';
import { ScopeSwitcher } from './scope-switcher';

export function EmbedAnalyticsOverviewView({
  data,
}: {
  data: EmbedAnalyticsOverview;
}) {
  return (
    <div className="eqa-page">
      <div className="eqa-eyebrow">Embedded question analytics</div>
      <h1 className="eqa-title">How are my notes landing?</h1>
      <p className="eqa-lede">
        Performance on the question blocks embedded inside your library
        notes. Notes are read self-paced, so every figure is scoped to{' '}
        <strong>readers who actually reached the block</strong> — never the
        whole class.
      </p>

      <ScopeSwitcher scope={data.scope} basePath="/tutor/library/analytics" />

      {!data.hasAnyBlocks ? (
        <EmptyState
          glyph="✦"
          title="No embedded questions yet"
          body="Drop a Practice block into a library note — “now try these” — and once students start answering, their first-try accuracy shows up here."
        />
      ) : (
        <>
          <div className="eqa-kpis">
            {data.kpis.map((k, i) => (
              <div className="eqa-kpi" key={i}>
                <div className="eqa-kpi-label">{k.label}</div>
                <div
                  className="eqa-kpi-value"
                  data-tone={k.tone ?? 'neutral'}
                >
                  {k.value}
                </div>
                <div className="eqa-kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {!data.hasAnyData ? (
            <EmptyState
              glyph="◔"
              title="No reading-check answers yet"
              body="Your notes have embedded questions, but no reader has answered one yet. The re-teach signal and per-note breakdown fill in as students practise."
            />
          ) : (
            <>
              <section className="eqa-card">
                <header className="eqa-card-head">
                  <div>
                    <h2 className="eqa-card-title">Re-teach signal</h2>
                    <p className="eqa-card-sub">
                      Embedded questions most readers missed on the first
                      try — your highest-leverage review targets.
                    </p>
                  </div>
                  <span className="eqa-card-tag">first-attempt</span>
                </header>
                {data.reteach.length === 0 ? (
                  <div className="eqa-empty-row">
                    No question has enough readers yet to flag (needs ≥ 3).
                  </div>
                ) : (
                  data.reteach.map((q) => (
                    <Link
                      key={`${q.noteId}-${q.itemId}`}
                      href={`/tutor/library/analytics/note/${q.noteId}?q=${q.itemId}`}
                      className="eqa-reteach-row"
                    >
                      <div className="eqa-reteach-main">
                        <div className="eqa-crumb">
                          {q.noteTitle} · {q.blockLabel}
                        </div>
                        <div className="eqa-stem">{q.stem}</div>
                      </div>
                      <div className="eqa-reteach-bar">
                        <div className="eqa-bar">
                          <span
                            className="eqa-bar-fill"
                            data-tier={q.tier}
                            style={{ width: `${q.firstAccPct}%` }}
                          />
                        </div>
                        <div className="eqa-reteach-acc">
                          {q.firstAccPct}% correct first try
                        </div>
                      </div>
                      <div className="eqa-reteach-reach">
                        <div className="eqa-reach-n">{q.reach}</div>
                        <div className="eqa-reach-lbl">reached</div>
                      </div>
                    </Link>
                  ))
                )}
              </section>

              <section className="eqa-notes">
                <h2 className="eqa-card-title eqa-notes-title">
                  Notes with embedded questions
                </h2>
                <div className="eqa-table">
                  <div className="eqa-tr eqa-th">
                    <span>Note</span>
                    <span>Reach</span>
                    <span>First-attempt accuracy</span>
                    <span className="eqa-right">Weakest block</span>
                  </div>
                  {data.notes.map((n) => (
                    <Link
                      key={n.noteId}
                      href={`/tutor/library/analytics/note/${n.noteId}`}
                      className="eqa-tr eqa-tr-row"
                    >
                      <div className="eqa-note-cell">
                        <div className="eqa-note-title">{n.title}</div>
                        <div className="eqa-note-meta">
                          {n.blockCount} block{n.blockCount === 1 ? '' : 's'} ·{' '}
                          {n.questionCount} question
                          {n.questionCount === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="eqa-reach-cell">{n.reach || '—'}</div>
                      <div className="eqa-acc-cell">
                        {n.firstAccPct === null ? (
                          <span className="eqa-nodata">No reads yet</span>
                        ) : (
                          <div className="eqa-acc-wrap">
                            <div className="eqa-bar">
                              <span
                                className="eqa-bar-fill"
                                data-tier={n.tier ?? 'holding'}
                                style={{ width: `${n.firstAccPct}%` }}
                              />
                            </div>
                            <span
                              className="eqa-acc-pct"
                              data-tier={n.tier ?? 'holding'}
                            >
                              {n.firstAccPct}%
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="eqa-weak-cell eqa-right">
                        {n.weakestBlockLabel !== null &&
                        n.weakestBlockPct !== null ? (
                          <span
                            className="eqa-weak"
                            data-tier={tierOf(n.weakestBlockPct)}
                          >
                            {n.weakestBlockLabel} · {n.weakestBlockPct}%
                          </span>
                        ) : (
                          <span className="eqa-nodata">—</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  glyph,
  title,
  body,
}: {
  glyph: string;
  title: string;
  body: string;
}) {
  return (
    <div className="eqa-empty">
      <div className="eqa-empty-glyph" aria-hidden="true">
        {glyph}
      </div>
      <div className="eqa-empty-title">{title}</div>
      <p className="eqa-empty-body">{body}</p>
    </div>
  );
}
