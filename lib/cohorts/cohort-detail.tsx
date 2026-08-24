// mynclex/lib/cohorts/cohort-detail.tsx
//
// The cohort run detail — rendered IN PLACE by the programme Cohorts
// page when `?cohort=` is set (cohort-workspace fold, 2026-06-12).
// The library pattern: one route, URL-param navigation, in-page
// chrome. The programme sidebar never swaps.
//
// Server component. Fetches only the ACTIVE tab's data (the pane
// switch branches before fetching), so per-request cost matches the
// old per-page cohort world this replaced.
//
// Tabs are plain <Link>s carrying ?cohort=&tab= — no client state.
// `tab=progress` is the default and omits the param for clean URLs.

import Link from 'next/link';
import { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
import { CohortAnalyticsView } from '@/lib/analytics/tutor/analytics-view';
import { getCohortChecklist, getCohortForShell } from './queries';
import { CohortCurriculum } from './cohort-curriculum';
import { CohortSessionsPane } from './cohort-sessions-pane';
import { CohortSettingsPane } from './cohort-settings-pane';
import { CohortPaymentPlansPane } from '@/lib/strategies/cohort-payment-plans-pane';
import { getCohortHasCustomPricing } from '@/lib/strategies/queries';
import {
  cohortStatus,
  cohortStatusPillClass,
  formatCohortName,
  formatCohortSeats,
  formatCohortStatusLabel,
  formatDateRange,
} from './format';

// Analytics folded INTO the landing tab (2026-06-25): it IS the cohort
// analytics dashboard, plus a slim enrolment action + cancelled banner.
//
// ⭐ RENAMED 'overview' → 'progress' (2026-08-23, Sam). "Overview" meant two
// different kinds of page in this product: the PROGRAMME Overview is a grid
// of summary cards (money, counts, enquiries), while this one is a progress
// dashboard. The ambiguity predates the self-paced Progress page — building
// that surface only made it impossible to ignore, since the same content
// would otherwise have carried two names depending on delivery mode. One
// word, one meaning: Overview = summary cards, Progress = how students are
// doing.
//
// Old deep links keep working for free: an unrecognised `&tab=` value —
// including the old 'overview' and the older 'analytics' — falls through
// parse to the default, which is this same tab.
export const COHORT_DETAIL_TABS = [
  'progress',
  'curriculum',
  'sessions',
  'pricing',
  'settings',
] as const;

export type CohortDetailTab = (typeof COHORT_DETAIL_TABS)[number];

const TAB_LABEL: Record<CohortDetailTab, string> = {
  progress: 'Progress',
  curriculum: 'Curriculum',
  sessions: 'Sessions',
  pricing: 'Pricing',
  settings: 'Settings',
};

export function parseCohortDetailTab(raw: string | null): CohortDetailTab {
  return (COHORT_DETAIL_TABS as readonly string[]).includes(raw ?? '')
    ? (raw as CohortDetailTab)
    : 'progress';
}

// Sessions has two sub-tabs (Schedule | Attendance), carried by ?stab=.
// Schedule is the default and omits the param.
export const SESSIONS_SUBTABS = ['schedule', 'attendance'] as const;
export type SessionsSubTab = (typeof SESSIONS_SUBTABS)[number];

export function parseSessionsSubTab(raw: string | null): SessionsSubTab {
  return raw === 'attendance' ? 'attendance' : 'schedule';
}

/** Tab href — the default tab omits ?tab= for clean URLs. */
export function cohortTabHref(
  programmeId: string,
  cohortId: string,
  tab: CohortDetailTab
): string {
  const base = `/tutor/programme/${programmeId}/cohorts?cohort=${cohortId}`;
  return tab === 'progress' ? base : `${base}&tab=${tab}`;
}

export async function CohortDetail({
  programmeId,
  cohortId,
  tab,
  sessionsSubTab = 'schedule',
}: {
  programmeId: string;
  cohortId: string;
  tab: CohortDetailTab;
  sessionsSubTab?: SessionsSubTab;
}) {
  const listHref = `/tutor/programme/${programmeId}/cohorts`;

  // Ownership is RLS-gated inside the query (null = unknown or not
  // mine); the programme check catches a cohort id pasted under the
  // wrong programme's URL.
  const [ctx, hasCustomPricing] = await Promise.all([
    getCohortForShell(cohortId),
    getCohortHasCustomPricing(cohortId),
  ]);
  if (!ctx || ctx.cohort.programme_id !== programmeId) {
    return (
      <div className="cohort-detail-missing">
        <h2 className="cohort-detail-missing-title">Cohort not found</h2>
        <p className="cohort-detail-missing-sub">
          This cohort doesn&apos;t exist in this programme — it may have
          been removed, or the link is stale.
        </p>
        <Link href={listHref} className="cohort-overview-link">
          ← All cohorts
        </Link>
      </div>
    );
  }

  const { cohort } = ctx;
  const status = cohortStatus(cohort);
  const displayName = formatCohortName(cohort);
  const dateRange = formatDateRange(cohort.start_date, cohort.end_date);

  return (
    <div className="cohort-detail">
      <Link href={listHref} className="cohort-detail-back">
        ← All cohorts
      </Link>

      <header className="cohort-detail-head">
        <div>
          <h1 className="cohort-page-title">{displayName}</h1>
          <p className="cohort-detail-meta">
            {dateRange} · {formatCohortSeats(cohort.cohort_size)}
            {cohort.allow_late_join && ' · Late join on'}
          </p>
        </div>
        <div className="cohort-detail-pills">
          {hasCustomPricing && (
            <span
              className="cohort-pill is-custom-pricing"
              title="This cohort has its own payment plans"
            >
              Custom pricing
            </span>
          )}
          <span className={`cohort-pill ${cohortStatusPillClass(status)}`}>
            {formatCohortStatusLabel(status)}
          </span>
        </div>
      </header>

      <nav className="cohort-tabs" aria-label="Cohort sections">
        {COHORT_DETAIL_TABS.map((t) => (
          <Link
            key={t}
            href={cohortTabHref(programmeId, cohortId, t)}
            className={t === tab ? 'cohort-tab active' : 'cohort-tab'}
            aria-current={t === tab ? 'page' : undefined}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      <CohortDetailPane
        programmeId={programmeId}
        cohortId={cohortId}
        tab={tab}
        sessionsSubTab={sessionsSubTab}
        ctx={ctx}
      />
    </div>
  );
}

// Pane switch — branches BEFORE fetching so each request only pays
// for the tab it renders.
async function CohortDetailPane({
  programmeId,
  cohortId,
  tab,
  sessionsSubTab,
  ctx,
}: {
  programmeId: string;
  cohortId: string;
  tab: CohortDetailTab;
  sessionsSubTab: SessionsSubTab;
  ctx: NonNullable<Awaited<ReturnType<typeof getCohortForShell>>>;
}) {
  switch (tab) {
    case 'progress': {
      // The merged landing: the cohort analytics dashboard, topped with a
      // cancelled banner (when relevant) + a slim enrolment action so the
      // run's health is the first thing the eye lands on.
      const analytics = await getCohortAnalytics(cohortId, {
        includePerformance: true,
      });
      const status = cohortStatus(ctx.cohort);
      const enrolmentsHref = `/tutor/programme/${programmeId}/enrolments?cohort=${cohortId}`;
      const seatBit =
        ctx.cohort.cohort_size != null ? ` · ${ctx.cohort.cohort_size} seats` : '';
      return (
        <div className="cohort-overview">
          {status === 'CANCELLED' && ctx.cohort.cancelled_at && (
            <section className="cohort-overview-card is-cancelled">
              <h2 className="cohort-overview-card-title">Cancelled</h2>
              <p className="cohort-overview-prose">
                This cohort was cancelled on{' '}
                {new Date(ctx.cohort.cancelled_at).toLocaleDateString()}. Students
                lose access; new enrolments are blocked. Contact an admin to
                reinstate it if needed.
              </p>
            </section>
          )}

          <div className="cohort-overview-actions">
            <span className="cohort-overview-enrolled">
              {analytics
                ? `${analytics.summary.studentCount} enrolled${seatBit}`
                : 'Enrolment'}
            </span>
            <Link href={enrolmentsHref} className="cohort-overview-link">
              Manage enrolments →
            </Link>
          </div>

          {analytics ? (
            <CohortAnalyticsView data={analytics} />
          ) : (
            <p className="an-note">
              Analytics will appear once this cohort has students.
            </p>
          )}
        </div>
      );
    }
    case 'curriculum': {
      const tree = await getCohortChecklist(cohortId);
      // Guarded above; null only on a race (cohort deleted mid-request).
      if (!tree) return null;
      return <CohortCurriculum tree={tree} />;
    }
    case 'sessions':
      return (
        <CohortSessionsPane
          programmeId={programmeId}
          cohortId={cohortId}
          subTab={sessionsSubTab}
        />
      );
    case 'pricing':
      return <CohortPaymentPlansPane cohortId={cohortId} />;
    case 'settings':
      return (
        <CohortSettingsPane cohort={ctx.cohort} programme={ctx.programme} />
      );
  }
}
