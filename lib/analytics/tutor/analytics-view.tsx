// mynclex/lib/analytics/tutor/analytics-view.tsx
//
// Tutor analytics — the client view behind BOTH delivery units: a cohort's
// Progress tab and a self-paced programme's Progress page. Owns the filter /
// sort / drawer-selection state; everything it renders is derived from the
// TutorAnalytics object computed server-side. Phase 2 (quiz performance)
// adds teal panes into the same shell.
//
// ⭐ ONE VIEW, TWO VOCABULARIES, selected by `data.mode`. A cohort is paced
// against a shared calendar, so its students are on track / behind / at
// risk. A self-paced programme has no shared calendar — everyone starts on
// the day they buy and the whole curriculum unlocks at once — so a
// completion % has no referent and pace language would lie: a student who
// joined yesterday would read as "at risk" on day one. Self-paced students
// are described by ENGAGEMENT over time instead (not started / active /
// stalled / finished), with "ending soon" as a separate overlay.
//
// The two are branched inline rather than forked into two components: the
// table, drawer, per-activity rollup and quiz panes are identical, and two
// copies would drift.

'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  CompletionBar,
  Dial,
  EngagementPill,
  Sparkline,
  StatusPill,
  ScoreChip,
  ACTIVITY_META,
} from './atoms';
import { StudentDrawer } from './student-drawer';
import {
  STALLED_AFTER_DAYS,
  type CompletionStatus,
  type EngagementStatus,
  type StudentAnalyticsRow,
  type TutorAnalytics,
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

// Self-paced severity. "Never started" outranks "stalled": somebody who
// paid and never opened anything is the clearest failure and the most
// recoverable, so they belong at the top of the list.
const SEV_ENG: Record<EngagementStatus, number> = {
  notstarted: 0,
  stalled: 1,
  active: 2,
  done: 3,
};
const ATTENTION_ENG = new Set<EngagementStatus>(['notstarted', 'stalled']);

function engOf(s: StudentAnalyticsRow): EngagementStatus {
  return s.engagement ?? 'notstarted';
}

/** Needs a person. Self-paced folds in `endingSoon`, which is a reason to
 *  act (extend, or warn them) however engaged the student is. */
function needsAttention(s: StudentAnalyticsRow, selfPaced: boolean): boolean {
  return selfPaced
    ? ATTENTION_ENG.has(engOf(s)) || s.endingSoon
    : ATTENTION.has(s.status);
}

/** "3d ago" / "2w ago" / "5mo ago" — coarser as it ages, because nobody
 *  needs day precision on something four months old. */
function agoLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/** Access-window remainder. Null = lifetime, which is a real answer here
 *  and must not render as an em-dash "we don't know". */
function accessLabel(days: number | null): string {
  if (days == null) return 'Lifetime';
  if (days === 0) return 'ends today';
  if (days === 1) return '1 day left';
  if (days < 14) return `${days} days left`;
  if (days < 60) return `${Math.round(days / 7)} weeks left`;
  return `${Math.round(days / 30)} months left`;
}

function unitWord(label: UnitLabel, cap = false): string {
  const w = label === 'WEEK' ? 'week' : 'module';
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

function orderStudents(
  rows: StudentAnalyticsRow[],
  mode: SortMode,
  selfPaced: boolean,
): StudentAnalyticsRow[] {
  const arr = [...rows];
  if (mode === 'completion-desc') {
    arr.sort((a, b) => b.completionPct - a.completionPct);
  } else if (mode === 'name') {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else if (selfPaced) {
    // Attention order: worst state first, then longest-silent first. The
    // tie-break is TIME, not completion — a stalled student who vanished
    // three months ago is a more urgent call than one who paused last week,
    // whatever percentages the two happen to be sitting on.
    arr.sort(
      (a, b) =>
        SEV_ENG[engOf(a)] - SEV_ENG[engOf(b)] ||
        (b.lastActiveDays ?? Number.MAX_SAFE_INTEGER) -
          (a.lastActiveDays ?? Number.MAX_SAFE_INTEGER),
    );
  } else {
    arr.sort(
      (a, b) => SEV[a.status] - SEV[b.status] || a.completionPct - b.completionPct,
    );
  }
  return arr;
}

export function CohortAnalyticsView({ data }: { data: TutorAnalytics }) {
  const { meta, summary, students, activities } = data;
  const selfPaced = data.mode === 'SELF_PACED';
  const perf = data.performance;
  const showPerf = !!perf && perf.quizzes.length > 0;
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('attention');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: students.length,
      attention: students.filter((s) => needsAttention(s, selfPaced)).length,
      ontrack: students.filter((s) =>
        selfPaced ? engOf(s) === 'active' : s.status === 'ontrack',
      ).length,
    }),
    [students, selfPaced],
  );

  const shown = useMemo(() => {
    let list = orderStudents(students, sort, selfPaced);
    if (filter === 'attention') {
      list = list.filter((s) => needsAttention(s, selfPaced));
    }
    if (filter === 'ontrack') {
      list = list.filter((s) =>
        selfPaced ? engOf(s) === 'active' : s.status === 'ontrack',
      );
    }
    return list;
  }, [students, sort, filter, selfPaced]);

  const selected = selectedId
    ? students.find((s) => s.userId === selectedId) ?? null
    : null;

  const b = summary.buckets;
  const attn = b.behind + b.risk;
  // Self-paced counterparts. `engagement` is non-null whenever mode is
  // SELF_PACED; the fallback keeps this total rather than asserting.
  const e = summary.engagement ?? { notstarted: 0, active: 0, stalled: 0, done: 0 };
  const endingSoonCount = summary.endingSoon ?? 0;
  const attnEng = e.notstarted + e.stalled;

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
          {selfPaced
            ? 'No actively-enrolled students on this programme yet. Progress appears once somebody enrols and starts working through the curriculum.'
            : 'No actively-enrolled students in this cohort yet. Completion analytics appear once students are enrolled and start working through the curriculum.'}
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
            {selfPaced ? (
              <>
                Student progress · {meta.totalUnits}{' '}
                {unitWord(meta.unitLabel)}
                {meta.totalUnits === 1 ? '' : 's'} · everyone on their own clock
              </>
            ) : (
              <>
                Class health · {unitWord(meta.unitLabel)} {meta.currentUnit} of{' '}
                {meta.totalUnits}
              </>
            )}
          </div>
          <div className="an-health-line">
            {selfPaced ? (
              <>
                <b className="g">{e.active}</b> of {summary.studentCount}{' '}
                {summary.studentCount === 1 ? 'student is' : 'students are'} working
                {(attnEng > 0 || e.done > 0 || endingSoonCount > 0) && (
                  <>
                    {e.stalled > 0 && (
                      <>
                        , <b className="a">{e.stalled} stalled</b>
                      </>
                    )}
                    {e.notstarted > 0 && (
                      <>
                        {' — '}
                        <b className="r">{e.notstarted}</b>{' '}
                        {e.notstarted === 1 ? "hasn't" : "haven't"} started at all
                      </>
                    )}
                    {e.done > 0 && (
                      <>
                        {' · '}
                        <b className="g">{e.done} finished</b>
                      </>
                    )}
                    {endingSoonCount > 0 && (
                      <>
                        {' · '}
                        <b className="a">
                          {endingSoonCount} running out of access
                        </b>
                      </>
                    )}
                  </>
                )}
                .
                {showPerf && perf!.summary.perfRisk > 0 && (
                  <>
                    {' '}
                    <b style={{ color: 'var(--accent)' }}>
                      {perf!.summary.perfRisk} failed their most recent quiz.
                    </b>
                  </>
                )}
              </>
            ) : (
              <>
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
                      {perf!.summary.perfRisk} failed their most recent quiz.
                    </b>
                  </>
                )}
              </>
            )}
          </div>
          <div className="an-legend">
            {selfPaced ? (
              <>
                <span className="an-chip ok"><span className="n">{e.active}</span> active</span>
                <span className="an-chip warn"><span className="n">{e.stalled}</span> stalled</span>
                <span className="an-chip bad"><span className="n">{e.notstarted}</span> not started</span>
                {e.done > 0 && (
                  <span className="an-chip ok"><span className="n">{e.done}</span> finished</span>
                )}
                {endingSoonCount > 0 && (
                  <span className="an-chip warn"><span className="n">{endingSoonCount}</span> ending soon</span>
                )}
              </>
            ) : (
              <>
                <span className="an-chip ok"><span className="n">{b.ontrack}</span> on track</span>
                <span className="an-chip warn"><span className="n">{b.behind}</span> behind</span>
                <span className="an-chip bad"><span className="n">{b.risk}</span> at risk</span>
                {b.notstarted > 0 && (
                  <span className="an-chip idle"><span className="n">{b.notstarted}</span> not started</span>
                )}
                {summary.stale > 0 && (
                  <span className="an-chip idle"><span className="n">{summary.stale}</span> inactive 7d+</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className={`an-kpis ${showPerf ? 'has-perf' : ''}`}>
        <div className="an-kpi">
          <div className="k">Avg completion</div>
          <div className="an-kpi-big navy">{summary.avgCompletion}<span className="unit">%</span></div>
          <div className="sub">
            {selfPaced
              ? `of the ${meta.totalCount} activities in the programme`
              : `of ${meta.releasedCount} activities released so far`}
          </div>
          <div className="an-spark"><Sparkline values={data.completionTrend} /></div>
        </div>
        {selfPaced ? (
          <>
            <div className="an-kpi">
              <div className="k">Active</div>
              <div className="an-kpi-big" style={{ color: 'var(--success)' }}>
                {e.active}<span className="of"> / {summary.studentCount}</span>
              </div>
              <div className="sub">Worked on it in the last {STALLED_AFTER_DAYS} days</div>
            </div>
            <div className="an-kpi">
              <div className="k">Need attention</div>
              <div className="an-kpi-big" style={{ color: 'var(--warning)' }}>{attnEng}</div>
              <div className="sub">{e.stalled} stalled · {e.notstarted} never started</div>
            </div>
            <div className="an-kpi">
              <div className="k">Ending soon</div>
              <div
                className="an-kpi-big"
                style={{ color: endingSoonCount ? 'var(--danger)' : 'var(--text)' }}
              >
                {endingSoonCount}
              </div>
              <div className="sub">Access closing with work left</div>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
        {showPerf && (
          <div className="an-kpi">
            <div className="k">Avg quiz score</div>
            <div className="an-kpi-big teal">
              {perf!.summary.avgQuizScore ?? '—'}
              {perf!.summary.avgQuizScore != null && <span className="unit">%</span>}
            </div>
            <div className="sub">
              {perf!.summary.passRate != null
                ? `${perf!.summary.passRate}% pass rate (${perf!.summary.passes}/${perf!.summary.attempts})`
                : `${perf!.summary.attempts} attempts`}
            </div>
          </div>
        )}
      </div>

      {/* ── Per student ── */}
      <div className="an-section">
        <div className="an-section-head">
          <div className="lhs">
            <h2>Per student</h2>
            <span className="hint">
              {selfPaced
                ? 'Who needs you — longest silent first'
                : 'Who is keeping up — laggards first'}
            </span>
          </div>
          <div className="an-tools">
            {(
              [
                ['all', 'All'],
                ['attention', 'Needs attention'],
                ['ontrack', selfPaced ? 'Active' : 'On track'],
              ] as const
            ).map(
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
              <option value="attention">
                {selfPaced ? 'Sort: needs attention first' : 'Sort: laggards first'}
              </option>
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
                {showPerf && <th>Latest quiz</th>}
                {/* Self-paced only: each student has their own access clock,
                    where a cohort shares one end date. */}
                {selfPaced && <th className="num">Access</th>}
                <th className="num">Last active</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const eng = engOf(s);
                const flagged = selfPaced
                  ? eng === 'notstarted' || eng === 'stalled'
                  : s.status === 'risk' || s.status === 'notstarted';
                return (
                  <tr key={s.userId} className={flagged ? 'flagged' : ''} onClick={() => setSelectedId(s.userId)}>
                    <td>
                      <div className="an-who">
                        <Avatar name={s.name} />
                        <div style={{ minWidth: 0 }}>
                          <div className="nm">{s.name}</div>
                          {/* ⭐ Self-paced replaces the second percentage with
                              JOINED. Their enrolment date is their personal
                              week 1, and it is what makes the completion %
                              readable — "joined 3 weeks ago, 12% done" says
                              something a bare 12% cannot. */}
                          <div className="em">
                            {selfPaced ? (
                              <>
                                {s.doneCount} / {s.releasedCount} done · joined{' '}
                                {agoLabel(s.joinedDays ?? 0)}
                              </>
                            ) : (
                              <>
                                {s.doneCount} / {s.releasedCount} done · {s.programmePct}% of programme
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Completion">
                      <CompletionBar pct={s.completionPct} status={selfPaced ? eng : s.status} />
                    </td>
                    <td data-label="Status">
                      {selfPaced ? (
                        <EngagementPill status={eng} endingSoon={s.endingSoon} />
                      ) : (
                        <StatusPill status={s.status} />
                      )}
                    </td>
                    {showPerf && (
                      <td data-label="Latest quiz">
                        <ScoreChip
                          score={perf!.byStudent[s.userId]?.latestScore ?? null}
                          pass={perf!.byStudent[s.userId]?.latestPass ?? null}
                        />
                      </td>
                    )}
                    {selfPaced && (
                      <td
                        className="num"
                        data-label="Access"
                        style={{
                          color: s.endingSoon ? 'var(--danger)' : 'var(--text-muted)',
                        }}
                      >
                        {accessLabel(s.accessDaysLeft)}
                      </td>
                    )}
                    <td className="num" data-label="Last active" style={{ color: s.lastActiveDays != null && s.lastActiveDays >= 7 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {s.lastActiveDays == null ? '—' : agoLabel(s.lastActiveDays)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="an-legend-key">
          {selfPaced ? (
            <>
              <span className="it"><span className="sw" style={{ background: 'var(--success)' }} /> active — worked on it within {STALLED_AFTER_DAYS} days</span>
              <span className="it"><span className="sw" style={{ background: 'var(--warning)' }} /> stalled — started, nothing since</span>
              <span className="it"><span className="sw" style={{ background: 'var(--danger)' }} /> not started — never opened anything</span>
              <span className="it">bars show % of all {meta.totalCount} activities; everyone has had the whole programme since they joined</span>
            </>
          ) : (
            <>
              <span className="it"><span className="sw" style={{ background: 'var(--success)' }} /> on track ≥ 75%</span>
              <span className="it"><span className="sw" style={{ background: 'var(--warning)' }} /> behind 40–75%</span>
              <span className="it"><span className="sw" style={{ background: 'var(--danger)' }} /> at risk &lt; 40%</span>
              <span className="it">bars show % of the {meta.releasedCount} activities released so far</span>
            </>
          )}
        </div>
      </div>

      {/* ── Per activity ── */}
      <div className="an-section">
        <div className="an-section-head">
          <div className="lhs">
            <h2>Per activity</h2>
            <span className="hint">
              {selfPaced
                ? 'Where students stop — the drop-off through the curriculum'
                : 'What the class is lagging on'}
            </span>
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
              <span className="hint">Pass rates &amp; class averages — best attempt per student</span>
            </div>
          </div>
          <div className="an-quizgrid">
            {perf!.quizzes.map((q) => {
              const m = ACTIVITY_META[q.type];
              return (
                <div key={q.quizId} className="an-quizcard">
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

      {/* ── Hardest questions / re-teach signal (Phase 2b) ── */}
      {showPerf && perf!.missRates.length > 0 && (
        <div className="an-section">
          <div className="an-section-head">
            <div className="lhs">
              <h2>Hardest questions</h2>
              <span className="hint">Where the class struggles most — a re-teach signal</span>
            </div>
          </div>
          <div className="an-card an-miss">
            {perf!.missRates.map((q) => (
              <div key={`${q.quizId}-${q.itemId}`} className="an-miss-row">
                <div className="an-miss-rate">{q.missRate}%</div>
                <div className="an-miss-body">
                  <div className="an-miss-stem" title={q.stem}>{q.stem}</div>
                  <div className="an-miss-meta">{q.quizTitle} · {q.wrong} of {q.answered} missed</div>
                </div>
                <div className="an-miss-bar">
                  <div className="track"><div className="fill" style={{ width: `${q.missRate}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <StudentDrawer
          student={selected}
          activities={activities}
          unitLabel={meta.unitLabel}
          quizPerf={perf?.byStudent[selected.userId] ?? null}
          selfPaced={selfPaced}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
