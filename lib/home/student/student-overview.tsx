// mynclex/lib/home/student/student-overview.tsx
//
// Student Overview view (server component) — the mode-aware programme /
// cohort home, from the Claude Design "Student Overview" prototype. The
// student-side parallel of lib/home/tutor/tutor-home.tsx.
//
// Layout (CD): hero (mode chip + greeting + 3 stats + progress ring) ·
// "pick up where you left off" continue banner · a two-column grid — main
// column ("Your weeks") + a rail (the navy next-session card in cohort
// mode, or the study-streak card in self-paced mode). Slice 2 fills the
// rail/main with Recent activity · Quizzes · Library · Attendance.
//
// Mode is fixed by the route (see ./types). The Continue banner reuses
// <ActivityAction> so its CTA is a real per-type launch — the same dispatch
// the curriculum uses. Styling: styles/student-home.css (`sho-` prefix).

import Link from 'next/link';
import { ActivityAction } from '@/lib/curriculum/activity-action';
import { NextSessionCard } from './next-session-card';
import type { RailUnit } from '@/lib/curriculum/student-curriculum-pane';
import type { StudentOverviewData } from './types';

const RING_R = 50;
const RING_CIRC = 2 * Math.PI * RING_R;

export function StudentOverview({ data }: { data: StudentOverviewData }) {
  const cohort = data.mode === 'cohort';
  const ringOffset = RING_CIRC * (1 - Math.min(100, Math.max(0, data.overallPct)) / 100);
  const weeksLabel = data.unitNoun === 'week' ? 'Weeks done' : 'Modules done';

  return (
    <div className="sho">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="sho-hero">
        <div className="sho-hero-main">
          <div className="sho-hero-tags">
            <span className={'sho-mode-chip' + (cohort ? ' is-cohort' : ' is-self')}>
              {cohort ? 'Tutor-led' : 'Self-paced'}
            </span>
            {cohort && data.cohortName ? (
              <span className="sho-cohort-name">{data.cohortName}</span>
            ) : null}
          </div>
          <h1 className="sho-hero-title">
            Welcome back{data.firstName ? `, ${data.firstName}` : ''}
          </h1>
          <p className="sho-hero-sub">
            {data.programmeTitle} —{' '}
            {cohort
              ? 'you’re on track. Pick up where you left off below.'
              : 'study at your own pace. Pick up where you left off below.'}
          </p>
          <div className="sho-hero-stats">
            <Stat
              value={`${data.activitiesDone} / ${data.activitiesTotal}`}
              label="Activities done"
            />
            <span className="sho-hero-divider" aria-hidden="true" />
            <Stat
              value={`${data.weeksDone} / ${data.weeksTotal}`}
              label={weeksLabel}
            />
            <span className="sho-hero-divider" aria-hidden="true" />
            <Stat
              value={`🔥 ${data.heroStreak}`}
              label={cohort ? 'Attendance streak' : 'Study streak'}
            />
          </div>
        </div>
        <div className="sho-ring">
          <svg width="120" height="120" viewBox="0 0 120 120" className="sho-ring-svg">
            <circle cx="60" cy="60" r={RING_R} className="sho-ring-track" />
            <circle
              cx="60"
              cy="60"
              r={RING_R}
              className="sho-ring-fill"
              strokeDasharray={RING_CIRC.toFixed(1)}
              strokeDashoffset={ringOffset.toFixed(1)}
            />
          </svg>
          <div className="sho-ring-center">
            <span className="sho-ring-pct">{data.overallPct}%</span>
            <span className="sho-ring-cap">complete</span>
          </div>
        </div>
      </section>

      {/* ── Continue banner ──────────────────────────────────── */}
      <ContinueBanner data={data} />

      {/* ── Two-column grid ──────────────────────────────────── */}
      <div className="sho-grid">
        <div className="sho-col-main">
          {data.weeks.length > 0 && (
            <YourWeeks
              weeks={data.weeks}
              curriculumHref={data.curriculumHref}
              unitNoun={data.unitNoun}
            />
          )}
          {/* Slice 2: Recent activity */}
        </div>

        <div className="sho-col-rail">
          {cohort ? (
            <NextSessionCard
              next={data.nextSession}
              nowMs={data.nowMs}
              sessionsHref={`${data.basePath}/sessions`}
            />
          ) : (
            <StudyStreakCard
              streak={data.studyStreak}
              curriculumHref={data.curriculumHref}
            />
          )}
          {/* Slice 2: Quizzes · Library · Attendance */}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="sho-stat">
      <span className="sho-stat-value">{value}</span>
      <span className="sho-stat-label">{label}</span>
    </span>
  );
}

// ── Continue banner ──────────────────────────────────────────
function ContinueBanner({ data }: { data: StudentOverviewData }) {
  // Nothing to launch — distinguish "no content yet" from "all caught up".
  if (!data.continue) {
    if (data.activitiesTotal === 0) {
      return (
        <section className="sho-continue is-empty">
          <span className="sho-continue-icon" aria-hidden="true">
            🗂️
          </span>
          <div className="sho-continue-body">
            <div className="sho-continue-title">No content published yet</div>
            <div className="sho-continue-meta">
              Your {data.unitNoun}s will appear here as your tutor publishes them.
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="sho-continue is-done">
        <span className="sho-continue-icon" aria-hidden="true">
          🎉
        </span>
        <div className="sho-continue-body">
          <div className="sho-continue-title">You’re all caught up</div>
          <div className="sho-continue-meta">
            Great work — nothing’s waiting on you right now.
          </div>
        </div>
        <Link className="sho-continue-link" href={data.curriculumHref}>
          Review curriculum →
        </Link>
      </section>
    );
  }

  const { continue: c } = data;
  const eyebrow = c.isResume
    ? 'Resume where you left off'
    : data.activitiesDone === 0
      ? 'Start here'
      : 'Pick up where you left off';

  return (
    <section className="sho-continue">
      <span className="sho-continue-icon" aria-hidden="true">
        {c.icon}
      </span>
      <div className="sho-continue-body">
        <div className="sho-continue-eyebrow">{eyebrow}</div>
        <div className="sho-continue-title">{c.activity.title}</div>
        <div className="sho-continue-meta">
          {c.unitLabel} · {c.typeLabel}
        </div>
      </div>
      <div className="sho-continue-action">
        <ActivityAction activity={c.activity} libraryBasePath={data.libraryBasePath} />
      </div>
    </section>
  );
}

// ── Your weeks ───────────────────────────────────────────────
function YourWeeks({
  weeks,
  curriculumHref,
  unitNoun,
}: {
  weeks: RailUnit[];
  curriculumHref: string;
  unitNoun: 'week' | 'module';
}) {
  return (
    <section className="sho-card">
      <div className="sho-card-head">
        <h2 className="sho-card-title">Your {unitNoun}s</h2>
        <Link className="sho-card-link" href={curriculumHref}>
          Open curriculum →
        </Link>
      </div>
      <div className="sho-weeks">
        {weeks.map((w) => (
          <Link
            key={w.index}
            className="sho-week"
            href={`${curriculumHref}?unit=${w.index}`}
          >
            <div className="sho-week-name">
              <div className="sho-week-label">{w.label}</div>
              <div className="sho-week-title">{w.title}</div>
            </div>
            <div className="sho-week-bar">
              <span
                className={'sho-week-bar-fill' + (w.status === 'done' ? ' is-done' : '')}
                style={{ width: `${w.pct ?? 0}%` }}
              />
            </div>
            <WeekTag week={w} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function WeekTag({ week }: { week: RailUnit }) {
  if (week.status === 'locked') {
    return <span className="sho-week-tag is-locked">🔒 Opens soon</span>;
  }
  if (week.status === 'done') {
    return <span className="sho-week-tag is-done">✓ Done</span>;
  }
  return (
    <span className={'sho-week-tag' + (week.status === 'up-next' ? ' is-up-next' : '')}>
      {week.pct == null ? '—' : `${week.pct}%`}
    </span>
  );
}

// ── Study streak (self-paced rail) ───────────────────────────
function StudyStreakCard({
  streak,
  curriculumHref,
}: {
  streak: { current: number; best: number } | null;
  curriculumHref: string;
}) {
  const current = streak?.current ?? 0;
  const best = streak?.best ?? 0;
  return (
    <section className="sho-card sho-rail-feature">
      <div className="sho-feature-eyebrow">Your pace</div>
      <div className="sho-feature-streak">🔥 {current} {current === 1 ? 'day' : 'days'}</div>
      <div className="sho-feature-meta">
        {current === 0
          ? 'Study today to start a streak.'
          : `Best streak: ${best} ${best === 1 ? 'day' : 'days'}. Keep it going.`}
      </div>
      <Link className="sho-feature-btn" href={curriculumHref}>
        Keep studying
      </Link>
    </section>
  );
}
