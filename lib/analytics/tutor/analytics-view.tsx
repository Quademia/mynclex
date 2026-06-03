// mynclex/lib/analytics/tutor/analytics-view.tsx
//
// Cohort analytics — Phase 1 (completion) client view. Owns the filter /
// sort / drawer-selection state; everything it renders is derived from the
// CohortAnalytics object computed server-side. Phase 2 (quiz performance)
// adds teal panes into the same shell.

'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  CompletionBar,
  Dial,
  PhaseTag,
  Sparkline,
  StatusPill,
  ScoreChip,
  ACTIVITY_META,
} from './atoms';
import { StudentDrawer } from './student-drawer';
import type {
  CohortAnalytics,
  CompletionStatus,
  StudentAnalyticsRow,
} from './types';
import type { UnitLabel } from '@/lib/programmes/types';

type SortMode = 'attention' | 'completion-desc' | 'name';
type FilterMode = 'all' | 'attention' | 'ontrack';

const SEV: Record<CompletionStatus, number> = {
  notstarted: 0,
  risk: 1,
  behind: 2,
  ontrack: 3,
};
const ATTENTION = new Set<CompletionStatus>(['risk', 'behind', 'notstarted']);

function unitWord(label: UnitLabel, cap = false): string {
  const w = label === 'WEEK' ? 'week' : 'module';
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

function orderStudents(rows: StudentAnalyticsRow[], mode: SortMode): StudentAnalyticsRow[] {
  const arr = [...rows];
  if (mode === 'completion-desc') {
    arr.sort((a, b) => b.completionPct - a.completionPct);
  } else if (mode === 'name') {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    arr.sort(
      (a, b) => SEV[a.status] - SEV[b.status] || a.completionPct - b.completionPct,
    );
  }
  return arr;
}

export function CohortAnalyticsView({ data }: { data: CohortAnalytics }) {
  const { meta, summary, students, activities } = data;
  const perf = data.performance;
  const showPerf = !!perf && perf.quizzes.length > 0;
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('attention');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: students.length,
      attention: students.filter((s) => ATTENTION.has(s.status)).length,
      ontrack: students.filter((s) => s.status === 'ontrack').length,
    }),
    [students],
  );

  const shown = useMemo(() => {
    let list = orderStudents(students, sort);
    if (filter === 'attention') list = list.filter((s) => ATTENTION.has(s.status));
    if (filter === 'ontrack') list = list.filter((s) => s.status === 'ontrack');
    return list;
  }, [students, sort, filter]);

  const selected = selectedId
    ? students.find((s) => s.userId === selectedId) ?? null
    : null;

  const b = summary.buckets;
  const attn = b.behind + b.risk;

  // Week-band the activities (already unit/ordinal sorted by the query).
  const bands = useMemo(() => {
    const map = new Map<number, { title: string; rows: typeof activities }>();
    for (const a of activities) {
      const g = map.get(a.unitIndex) ?? { title: a.unitTitle, rows: [] };
      g.rows.push(a);
      map.set(a.unitIndex, g);
    }
    return [...map.entries()];
  }, [activities]);

  if (summary.studentCount === 0) {
    return (
      <div className="an">
        <p className="an-note">
          No actively-enrolled students in this cohort yet. Completion analytics
          appear once students are enrolled and start working through the
          curriculum.
        </p>
      </div>
    );
  }

  return (
    <div className="an">
      {/* ── Health headline ── */}
      <div className="an-health">
        <Dial pct={summary.avgCompletion} />
        <div className="an-health-body">
          <div className="an-eyebrow">
            Class health · {unitWord(meta.unitLabel)} {meta.currentUnit} of {meta.totalUnits}
          </div>
          <div className="an-health-line">
            <b className="g">{b.ontrack}</b> of {summary.studentCount} students are keeping up
            {attn + b.notstarted > 0 && (
              <>
                {b.behind > 0 && <>, <b className="a">{b.behind} slipping behind</b></>}
                {b.risk > 0 && <>, <b className="r">{b.risk} at risk</b></>}
                {b.notstarted > 0 && (
                  <> — <b className="r">{b.notstarted}</b> {b.notstarted === 1 ? "hasn't" : "haven't"} started yet</>
                )}
              </>
            )}
            .
            {showPerf && perf!.summary.perfRisk > 0 && (
              <>
                {' '}
                <b style={{ color: 'var(--accent)' }}>
                  {perf!.summary.perfRisk}{' '}
                  {perf!.summary.perfRisk === 1 ? 'failed' : 'failed'} their most recent quiz.
                </b>
              </>
            )}
          </div>
          <div className="an-legend">
            <span className="an-chip ok"><span className="n">{b.ontrack}</span> on track</span>
            <span className="an-chip warn"><span className="n">{b.behind}</span> behind</span>
            <span className="an-chip bad"><span className="n">{b.risk}</span> at risk</span>
            {b.notstarted > 0 && (
              <span className="an-chip idle"><span className="n">{b.notstarted}</span> not started</span>
            )}
            {summary.stale > 0 && (
              <span className="an-chip idle"><span className="n">{summary.stale}</span> inactive 7d+</span>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className={`an-kpis ${showPerf ? 'has-perf' : ''}`}>
        <div className="an-kpi">
          <div className="k"><PhaseTag n={1} /></div>
          <div className="an-kpi-big navy">{summary.avgCompletion}<span className="unit">%</span></div>
          <div className="sub">Avg completion · of {meta.releasedCount} released so far</div>
          <div className="an-spark"><Sparkline values={data.completionTrend} /></div>
        </div>
        <div className="an-kpi">
          <div className="k">On track</div>
          <div className="an-kpi-big" style={{ color: 'var(--success)' }}>
            {b.ontrack}<span className="of"> / {summary.studentCount}</span>
          </div>
          <div className="sub">Keeping pace with released work</div>
        </div>
        <div className="an-kpi">
          <div className="k">Need attention</div>
          <div className="an-kpi-big" style={{ color: 'var(--warning)' }}>{attn}</div>
          <div className="sub">{b.behind} behind · {b.risk} at risk</div>
        </div>
        <div className="an-kpi">
          <div className="k">Not started</div>
          <div className="an-kpi-big" style={{ color: b.notstarted ? 'var(--danger)' : 'var(--text)' }}>
            {b.notstarted}
          </div>
          <div className="sub">Zero completed activity</div>
        </div>
        {showPerf && (
          <div className="an-kpi">
            <div className="k"><PhaseTag n={2} /></div>
            <div className="an-kpi-big teal">
              {perf!.summary.avgQuizScore ?? '—'}
              {perf!.summary.avgQuizScore != null && <span className="unit">%</span>}
            </div>
            <div className="sub">
              {perf!.summary.passRate != null
                ? `${perf!.summary.passRate}% pass rate (${perf!.summary.passes}/${perf!.summary.attempts})`
                : `Avg quiz score · ${perf!.summary.attempts} attempts`}
            </div>
          </div>
        )}
      </div>

      {/* ── Per student ── */}
      <div className="an-section">
        <div className="an-section-head">
          <div className="lhs">
            <h2>Per student</h2>
            <PhaseTag n={1} />
            <span className="hint">Who is keeping up — laggards first</span>
          </div>
          <div className="an-tools">
            {([['all', 'All'], ['attention', 'Needs attention'], ['ontrack', 'On track']] as const).map(
              ([k, lbl]) => (
                <button
                  key={k}
                  className={`an-tool ${filter === k ? 'active' : ''}`}
                  onClick={() => setFilter(k)}
                >
                  {lbl} <span className="cnt">{counts[k]}</span>
                </button>
              ),
            )}
            <select
              className="an-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="attention">Sort: laggards first</option>
              <option value="completion-desc">Sort: most complete</option>
              <option value="name">Sort: name</option>
            </select>
          </div>
        </div>

        <div className="an-card">
          <table className="an-tbl">
            <thead>
              <tr>
                <th style={{ width: showPerf ? '30%' : '34%' }}>Student</th>
                <th style={{ width: showPerf ? '32%' : '40%' }}>Completion</th>
                <th>Status</th>
                {showPerf && <th>Latest quiz <PhaseTag n={2} /></th>}
                <th className="num">Last active</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const flagged = s.status === 'risk' || s.status === 'notstarted';
                return (
                  <tr key={s.userId} className={flagged ? 'flagged' : ''} onClick={() => setSelectedId(s.userId)}>
                    <td>
                      <div className="an-who">
                        <Avatar name={s.name} />
                        <div style={{ minWidth: 0 }}>
                          <div className="nm">{s.name}</div>
                          <div className="em">{s.doneCount} / {s.releasedCount} done · {s.programmePct}% of programme</div>
                        </div>
                      </div>
                    </td>
                    <td><CompletionBar pct={s.completionPct} status={s.status} /></td>
                    <td><StatusPill status={s.status} /></td>
                    {showPerf && (
                      <td>
                        <ScoreChip
                          score={perf!.byStudent[s.userId]?.latestScore ?? null}
                          pass={perf!.byStudent[s.userId]?.latestPass ?? null}
                        />
                      </td>
                    )}
                    <td className="num" style={{ color: s.lastActiveDays != null && s.lastActiveDays >= 7 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {s.lastActiveDays == null ? '—' : s.lastActiveDays === 0 ? 'today' : `${s.lastActiveDays}d ago`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="an-legend-key">
          <span className="it"><span className="sw" style={{ background: 'var(--success)' }} /> on track ≥ 75%</span>
          <span className="it"><span className="sw" style={{ background: 'var(--warning)' }} /> behind 40–75%</span>
          <span className="it"><span className="sw" style={{ background: 'var(--danger)' }} /> at risk &lt; 40%</span>
          <span className="it">bars show % of the {meta.releasedCount} activities released so far</span>
        </div>
      </div>

      {/* ── Per activity ── */}
      <div className="an-section">
        <div className="an-section-head">
          <div className="lhs">
            <h2>Per activity</h2>
            <PhaseTag n={1} />
            <span className="hint">What the class is lagging on</span>
          </div>
        </div>
        <div className="an-card">
          {bands.map(([unitIndex, g]) => (
            <div key={unitIndex}>
              <div className={`an-weekband ${unitIndex === meta.currentUnit ? 'now' : ''}`}>
                <span>
                  {unitWord(meta.unitLabel, true)} {unitIndex}
                  {unitIndex === meta.currentUnit ? ' · this week' : ''} · {g.title}
                </span>
                <span>{g.rows.length} {g.rows.length === 1 ? 'activity' : 'activities'}</span>
              </div>
              {g.rows.map((a) => {
                const m = ACTIVITY_META[a.type];
                if (!a.released) {
                  return (
                    <div key={a.activityId} className="an-act locked">
                      <div className={`an-tic ${m.quiz ? 'quiz' : ''}`}>{m.glyph}</div>
                      <div className="ti"><div className="t">{a.title}</div><div className="w">{m.label}</div></div>
                      <div className="cnt">—</div>
                      <div className="locktag">not released</div>
                    </div>
                  );
                }
                const status: CompletionStatus =
                  a.pct >= 75 ? 'ontrack' : a.pct >= 40 ? 'behind' : 'risk';
                return (
                  <div key={a.activityId} className="an-act">
                    <div className={`an-tic ${m.quiz ? 'quiz' : ''}`}>{m.glyph}</div>
                    <div className="ti"><div className="t">{a.title}</div><div className="w">{m.label}</div></div>
                    <div className="cnt">{a.doneCount}/{a.total}</div>
                    <CompletionBar pct={a.pct} status={status} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Quiz performance (Phase 2) ── */}
      {showPerf && (
        <div className="an-section">
          <div className="an-section-head">
            <div className="lhs">
              <h2>Quiz performance</h2>
              <PhaseTag n={2} />
              <span className="hint">Pass rates &amp; class averages — best attempt per student</span>
            </div>
          </div>
          <div className="an-quizgrid">
            {perf!.quizzes.map((q) => {
              const m = ACTIVITY_META[q.type];
              return (
                <div key={q.activityId} className="an-quizcard">
                  <div className="qc-head">
                    <span className="an-tic quiz">{m.glyph}</span>
                    <div className="qc-title" title={q.title}>{q.title}</div>
                  </div>
                  <div className="qc-avg">
                    {q.avgScore}<span className="u">%</span>
                    <span className="qc-avg-l">class average</span>
                  </div>
                  <div className="qc-meta">
                    {q.graded ? (
                      <>
                        <span className={`an-score ${(q.passRate ?? 0) >= 50 ? 'pass' : 'fail'}`}>
                          {q.passRate}% pass
                        </span>
                        <span className="qc-att">{q.passed} of {q.attempted} passed</span>
                      </>
                    ) : (
                      <span className="qc-att">{q.attempted} attempted · ungraded</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && (
        <StudentDrawer
          student={selected}
          activities={activities}
          unitLabel={meta.unitLabel}
          quizPerf={perf?.byStudent[selected.userId] ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
