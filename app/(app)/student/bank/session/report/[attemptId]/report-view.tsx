// mynclex/app/(app)/student/bank/session/report/[attemptId]/report-view.tsx
//
// The Session Report shell — built from the Claude Design "1c" direction
// (concept-not-source, rendered in our own tokens).
//
// Slice 1 is the SPINE: the breadcrumb, the factual headline, and the rail
// carrying the score, the facts and the two actions. The four readings and
// the per-question table are slices 2 and 3; the rail is already laid out to
// receive them.
//
// A server component. Nothing here needs client state — the rail is CSS
// sticky, and both actions are links. Responsive is CSS (@media in
// session-report.css) per CLAUDE.md UI #3: at ≤768px the rail becomes the
// top block above the sections, which is exactly what the readiness report
// does, rather than a second markup tree that could drift.

import Link from 'next/link';
import {
  allAxisRows,
  changesAgainstYou,
  defaultAxisRowCount,
  answerPoints,
  fixList,
  hasRebuildableFilters,
  landedLine,
  outcomeCounts,
  paceSeconds,
  pointsSplit,
  questionRows,
  rebuildHref,
  totalEngagedSeconds,
} from '@/lib/practice/report/derive';
import { formatDuration } from '@/lib/practice/history/format';
import type { SessionReport } from '@/lib/practice/report/types';
import { OutcomesCard } from './outcomes-card';
import { AnswerPointsCard } from './answer-points-card';
import { WhereYouSlipped } from './where-you-slipped';
import { FixList } from './fix-list';
import { EveryQuestion } from './every-question';

function sittingDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function SessionReportView({ report }: { report: SessionReport }) {
  const counts = outcomeCounts(report.questions);
  const points = answerPoints(report.questions);
  const engaged = totalEngagedSeconds(report.engagedSeconds, report.questions);
  const pace = paceSeconds(engaged, counts.answered);
  const scorePct =
    report.scoreFraction == null ? null : Math.round(report.scoreFraction * 100);

  const rebuild = rebuildHref(report.filters);
  const sameAgain = hasRebuildableFilters(report.filters);
  const split = pointsSplit(report.questions);
  const axes = allAxisRows(report.questions);
  const fixes = fixList(report.questions, report.attemptId);
  const rows = questionRows(report.questions, report.attemptId);
  const changes = changesAgainstYou(report.questions);

  // Time facts are omitted entirely when nothing was recorded. Per-question
  // timing arrived late in the product's life, so most older sittings have
  // none — and "0m" would tell a student they finished twenty questions
  // instantly. Same rule the History row follows.
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Fully correct', value: `${counts.full} of ${counts.total}` },
    { label: 'Answer points', value: `${points.earned} of ${points.total}` },
  ];
  const engagedLabel = formatDuration(engaged);
  if (engagedLabel) facts.push({ label: 'Time on task', value: engagedLabel });
  const paceLabel = formatDuration(pace);
  if (paceLabel) facts.push({ label: 'Pace', value: `${paceLabel} avg` });

  // The rail's jump list. Each figure is the one the section itself shows, so
  // the list can't advertise a number the section then contradicts — the
  // slipped count comes from defaultAxisRowCount(), which reads the same
  // "first axis with rows" rule the switcher opens on.
  const jumps = [
    { id: 'results', label: 'Your results', value: scorePct == null ? '—' : `${scorePct}%` },
    { id: 'slipped', label: 'Where you slipped', value: String(defaultAxisRowCount(axes)) },
    { id: 'fixes', label: 'Your fix list', value: String(fixes.length) },
    { id: 'questions', label: 'Every question', value: String(rows.length) },
  ];

  return (
    <div className="bsr">
      <nav className="bsr-crumb" aria-label="Breadcrumb">
        <Link className="bsr-back" href="/student/bank/history">
          ← Back to History
        </Link>
        <span className="bsr-crumb-trail">
          <span className="bsr-crumb-kind">Custom session · Report</span>
          <span className="bsr-crumb-when">{sittingDate(report.createdAt)}</span>
          <span className="bsr-crumb-mode">{report.modeLabel}</span>
        </span>
      </nav>

      <header className="bsr-head">
        <h1 className="bsr-h1">{report.summary}</h1>
        {/* Factual, and nothing else — see landedLine(). */}
        <p className="bsr-landed">{landedLine(counts)}</p>
      </header>

      <div className="bsr-body">
        <aside className="bsr-rail">
          <div className="bsr-score">
            <div
              className="bsr-ring"
              role="img"
              aria-label={
                scorePct == null
                  ? 'No score recorded for this session'
                  : `${scorePct} per cent for this session`
              }
              style={
                {
                  '--bsr-pct': scorePct == null ? 0 : scorePct,
                } as React.CSSProperties
              }
            >
              <span className="bsr-ring-value">
                {scorePct == null ? '—' : `${scorePct}%`}
              </span>
            </div>
            <div className="bsr-score-note">
              <p className="bsr-score-eyebrow">This session</p>
              <p className="bsr-score-sub">
                Item-equivalent average, partial credit included.
              </p>
              {/* ⭐ Directly under the number, not in a page footnote. This is
                  the sentence that stops the score being read as a verdict —
                  a pack DOES band you and DOES compare you to other students,
                  so a student who has seen that page will assume this one
                  means the same unless it says otherwise. */}
              <p className="bsr-score-rule">
                Not banded, not ranked against other students.
              </p>
            </div>
          </div>

          <dl className="bsr-facts">
            {facts.map((f) => (
              <div className="bsr-fact" key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>

          <div className="bsr-actions">
            <Link className="bsr-btn bsr-btn-primary" href={`/session/${report.attemptId}`}>
              Review all {counts.total} answers →
            </Link>
            {/* The label only promises sameness when there is something to
                reproduce; a filterless build has no "same" to build again.
                Either way the rebuild serves FRESH questions — the pool is
                deliberately not carried across. */}
            <Link className="bsr-btn bsr-btn-ghost" href={rebuild}>
              {sameAgain ? 'Build the same again' : 'Build another'}
            </Link>
          </div>

          {/* On this page.
           *
           * Plain anchors — no JavaScript, and each carries the figure for its
           * section so the list doubles as a contents summary: you can see
           * there are three fix-list items without scrolling to them.
           *
           * Hidden below 768px, per the design's own reasoning: once the rail
           * unstacks into the top block, these would be links to things
           * directly beneath them. */}
          <nav className="bsr-jump" aria-label="On this page">
            <p className="bsr-jump-h">On this page</p>
            <ul>
              {jumps.map((j) => (
                <li key={j.id}>
                  <a href={`#${j.id}`}>
                    <span className="bsr-jump-label">{j.label}</span>
                    <span className="bsr-jump-n">{j.value}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="bsr-sections">
          <div className="bsr-pair" id="results">
            <OutcomesCard counts={counts} />
            <AnswerPointsCard split={split} totalQuestions={counts.total} />
          </div>
          {/* Only the axis switcher is a client island — the four breakdowns
              are computed here, so the frozen answer keys they derive from
              never reach the browser. */}
          <div id="slipped">
            <WhereYouSlipped axes={axes} />
          </div>
          <div id="fixes">
            <FixList items={fixes} />
          </div>
          <div id="questions">
            <EveryQuestion rows={rows} changes={changes} />
          </div>
        </div>
      </div>
    </div>
  );
}
