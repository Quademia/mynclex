// mynclex/lib/home/tutor/programme-overview.tsx
//
// The tutor PROGRAMME Overview view (server component). Renders the CD
// "Overview — A Card Grid" prototype against real data: a header with the
// action cluster, a four-card KPI strip (mode-aware), and the five-card
// sections grid. The two-column work row (cohort / enrolment health +
// enquiries) lands in Slice 2. Styling: styles/programme-overview.css
// (`pov-` prefix).

import Link from 'next/link';
import { ProgrammeOverviewActions } from '@/lib/programmes/programme-overview-actions';
import {
  formatLength,
  formatPrice,
  formatStatusLabel,
  statusPillClass,
} from '@/lib/programmes/format';
import { ENROLMENT_STATUS_META } from '@/lib/enrolments/types';
import type {
  CohortHealthRow,
  CohortHealthStatus,
  EnquiryPreview,
  EnrolmentHealth,
  ProgrammeOverviewData,
} from './programme-overview-types';

// Local inline glyphs (24×24, stroke). Kept here rather than in ProgIcon —
// these are Overview-specific section/KPI icons, not programmes-list chrome.
const GLYPH: Record<string, string> = {
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cohorts:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2 6 12 13 22 6"/>',
  book: '<path d="M4 4h6v16H4zM14 4h6v16h-6z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  money:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/>',
  pause: '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
};

function Icon({ name, size = 16 }: { name: keyof typeof GLYPH; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: GLYPH[name] }}
    />
  );
}

export function ProgrammeOverview({ data }: { data: ProgrammeOverviewData }) {
  const { header, kpis, sections } = data;
  const id = header.programmeId;
  const tutored = header.deliveryMode === 'TUTOR_LED';
  const href = (seg: string) => `/tutor/programme/${id}/${seg}`;
  // SELF_PACED "needs attention" = never started + stalled. Deliberately
  // NOT the pace buckets a cohort uses: with no shared calendar there is
  // nothing to be behind, so the question is engagement over time.
  const spNeedAttention =
    (kpis.studentsNotStarted ?? 0) + (kpis.studentsStalled ?? 0);
  const unitsShort = header.unitLabel === 'WEEK' ? 'wks' : 'modules';
  const priceLabel = formatPrice(header.priceMinor, header.currency);

  return (
    <div className="pov">
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="pov-head">
        <div className="pov-head-id">
          <div className="pov-head-titlerow">
            <h1 className="pov-title">{header.title}</h1>
            <span className="pov-mode-chip">
              {tutored ? 'Tutor-led' : 'Self-paced'}
            </span>
            <span className={`pov-status-pill ${statusPillClass(header.status)}`}>
              {formatStatusLabel(header.status)}
            </span>
          </div>
          <div className="pov-meta">
            <span>
              {formatLength(header.lengthUnits, header.unitLabel)}
              {header.tagline ? ` · ${header.tagline}` : ''}
            </span>
            <span className="pov-meta-dot">·</span>
            <span className="pov-meta-price">{priceLabel}</span>
            {tutored && header.nextSessionLabel && (
              <>
                <span className="pov-meta-dot">·</span>
                <span className="pov-meta-inline">
                  <Icon name="clock" size={12} />
                  Next session <strong>{header.nextSessionLabel}</strong>
                </span>
              </>
            )}
            {header.revenueLabel && (
              <>
                <span className="pov-meta-dot">·</span>
                <span>
                  Revenue <strong className="pov-meta-rev">{header.revenueLabel}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        <ProgrammeOverviewActions
          programmeId={id}
          title={header.title}
          status={header.status}
          paymentGatesAccess={header.paymentGatesAccess}
          formValues={header.formValues}
        />
      </header>

      {/* ── KPI STRIP ──────────────────────────────────────────── */}
      <div className="pov-kpis">
        {/* 1 — Students (both modes) */}
        <Link href={href('enrolments')} className="pov-kpi">
          <div className="pov-kpi-top">
            <span className="pov-kpi-ic">
              <Icon name="users" />
            </span>
            {kpis.studentsNewThisWeek > 0 && (
              <span className="pov-kpi-delta">
                ↑{kpis.studentsNewThisWeek} <span>this week</span>
              </span>
            )}
          </div>
          <span className="pov-kpi-val">{kpis.studentsEnrolled}</span>
          <span className="pov-kpi-label">Students enrolled</span>
        </Link>

        {tutored ? (
          <>
            {/* 2 — Active cohorts */}
            <Link href={href('cohorts')} className="pov-kpi">
              <div className="pov-kpi-top">
                <span className="pov-kpi-ic">
                  <Icon name="cohorts" />
                </span>
                {kpis.cohortsNeedAttention > 0 && (
                  <span className="pov-kpi-attn">
                    {kpis.cohortsNeedAttention} need
                    {kpis.cohortsNeedAttention === 1 ? 's' : ''} attention
                  </span>
                )}
              </div>
              <span className="pov-kpi-val">{kpis.cohortsActive}</span>
              <span className="pov-kpi-label">Active cohorts</span>
            </Link>

            {/* 3 — Avg completion */}
            <Link href={href('cohorts')} className="pov-kpi">
              <div className="pov-kpi-top">
                <span className="pov-kpi-ic">
                  <Icon name="clock" />
                </span>
              </div>
              <span className="pov-kpi-val">
                {kpis.avgCompletion == null ? '—' : `${kpis.avgCompletion}%`}
              </span>
              <span className="pov-kpi-label">Avg completion</span>
            </Link>
          </>
        ) : (
          <>
            {/* 2 — Avg completion (self-paced) → the Progress dashboard.
                ⚠ This slot used to be a Revenue card. It was swapped, not
                dropped: revenue already prints in the header meta line a
                few pixels above, so the card was the page's second copy of
                one number while "is anybody actually doing the work" had
                no copy at all. The strip is a hard 4 columns
                (.pov-kpis, styles/programme-overview.css), so a fifth card
                would wrap and leave three empty cells. */}
            <Link href={href('progress')} className="pov-kpi">
              <div className="pov-kpi-top">
                <span className="pov-kpi-ic">
                  <Icon name="clock" />
                </span>
                {spNeedAttention > 0 && (
                  <span className="pov-kpi-attn">
                    {spNeedAttention} need{spNeedAttention === 1 ? 's' : ''} attention
                  </span>
                )}
              </div>
              <span className="pov-kpi-val">
                {kpis.avgCompletion == null ? '—' : `${kpis.avgCompletion}%`}
              </span>
              <span className="pov-kpi-label">Avg completion</span>
            </Link>

            {/* 3 — Overdue (self-paced) */}
            <Link
              href={href('enrolments')}
              className={`pov-kpi${kpis.enrolmentsOverdue > 0 ? ' is-danger' : ''}`}
            >
              <div className="pov-kpi-top">
                <span className="pov-kpi-ic">
                  <Icon name="pause" />
                </span>
                <span className="pov-kpi-sub">
                  {kpis.enrolmentsOverdue > 0 ? 'needs action' : 'all current'}
                </span>
              </div>
              <span className="pov-kpi-val">{kpis.enrolmentsOverdue}</span>
              <span className="pov-kpi-label">Overdue payments</span>
            </Link>
          </>
        )}

        {/* 4 — Open enquiries (both modes, amber). Enquiries live on the
            global inbox now, pre-scoped to this programme. */}
        <Link href={`/tutor/enquiries?programme=${id}`} className="pov-kpi is-amber">
          <div className="pov-kpi-top">
            <span className="pov-kpi-ic">
              <Icon name="mail" />
            </span>
            <span className="pov-kpi-sub">awaiting reply</span>
          </div>
          <span className="pov-kpi-val">{kpis.enquiriesOpen}</span>
          <span className="pov-kpi-label">Open enquiries</span>
        </Link>
      </div>

      {/* ── WORK ROW (mode-aware) ──────────────────────────────── */}
      <div className="pov-work">
        {tutored ? (
          <CohortsPanel cohorts={data.cohorts} programmeId={id} />
        ) : (
          <EnrolmentHealthPanel health={data.enrolmentHealth} programmeId={id} />
        )}
        <EnquiriesPanel
          enquiries={data.enquiries}
          openCount={kpis.enquiriesOpen}
          programmeId={id}
        />
      </div>

      {/* ── SECTIONS GRID ──────────────────────────────────────── */}
      <section className="pov-sections">
        <div className="pov-sections-eyebrow">Programme sections</div>
        <div className="pov-sections-grid">
          <SectionCard
            href={href('curriculum')}
            icon="book"
            label="Curriculum"
            value={sections.curriculum.units}
            sub={`${unitsShort} · ${sections.curriculum.activities} activities`}
          />
          <SectionCard
            href={href('library')}
            icon="book"
            label="Library"
            value={sections.library.notes}
            sub={`notes · ${sections.library.shelves} shelves`}
          />
          <SectionCard
            href={href('quizzes')}
            icon="target"
            label="Quizzes"
            value={sections.quizzes.total}
            sub={`${sections.quizzes.mock} mock · ${sections.quizzes.practice} practice`}
          />
          <SectionCard
            href={href('payment-plans')}
            icon="card"
            label="Payments"
            value={sections.payments.plans}
            sub={`plans · ${sections.payments.mode === 'ON_PLATFORM' ? 'online' : 'tutor-collected'}`}
          />
          <SectionCard
            href={href('enrolments')}
            icon="users"
            label="Enrolments"
            value={sections.enrolments.active}
            sub={`active · ${sections.enrolments.expired} expired`}
          />
        </div>
      </section>
    </div>
  );
}

function SectionCard({
  href,
  icon,
  label,
  value,
  sub,
}: {
  href: string;
  icon: keyof typeof GLYPH;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <Link href={href} className="pov-section">
      <span className="pov-section-ic">
        <Icon name={icon} size={18} />
      </span>
      <span className="pov-section-body">
        <span className="pov-section-label">{label}</span>
        <span className="pov-section-val">{value}</span>
        <span className="pov-section-sub">{sub}</span>
      </span>
      <span className="pov-section-arrow">
        <Icon name="arrow" size={12} />
      </span>
    </Link>
  );
}

// ── Cohort health panel (TUTOR_LED) ──────────────────────────────────
const COHORT_CHIP: Record<CohortHealthStatus, { label: string; cls: string }> = {
  'on-track': { label: 'On track', cls: 'is-ontrack' },
  watch: { label: 'Watch', cls: 'is-watch' },
  'just-started': { label: 'Just started', cls: 'is-fresh' },
  'no-data': { label: 'No students yet', cls: 'is-none' },
};

function CohortsPanel({
  cohorts,
  programmeId,
}: {
  cohorts: CohortHealthRow[];
  programmeId: string;
}) {
  return (
    <div className="pov-panel">
      <div className="pov-panel-head">
        <div className="pov-panel-title">
          <span className="pov-panel-ic">
            <Icon name="cohorts" size={13} />
          </span>
          Active cohorts
          {cohorts.length > 0 && (
            <span className="pov-panel-count">{cohorts.length}</span>
          )}
        </div>
        <Link
          href={`/tutor/programme/${programmeId}/cohorts`}
          className="pov-panel-link"
        >
          View all →
        </Link>
      </div>
      {cohorts.length === 0 ? (
        <p className="pov-panel-empty">No cohorts are running right now.</p>
      ) : (
        <div className="pov-cohort-list">
          {cohorts.map((c) => (
            <CohortRow key={c.cohortId} c={c} programmeId={programmeId} />
          ))}
        </div>
      )}
    </div>
  );
}

function CohortRow({
  c,
  programmeId,
}: {
  c: CohortHealthRow;
  programmeId: string;
}) {
  const chip = COHORT_CHIP[c.status];
  const watch = c.status === 'watch';
  return (
    <div className={`pov-cohort${watch ? ' is-watch' : ''}`}>
      <div className="pov-cohort-main">
        <div className="pov-cohort-toprow">
          <div className="pov-cohort-name">
            <span className="pov-cohort-name-text">{c.name}</span>
            <span className={`pov-cohort-chip ${chip.cls}`}>{chip.label}</span>
            {watch && c.laggingCount > 0 && (
              <span className="pov-cohort-lag">{c.laggingCount} lagging</span>
            )}
          </div>
          {watch && <span className="pov-cohort-flag">action needed</span>}
        </div>
        <div className="pov-cohort-meta">
          {c.dateRange} · {c.students} student{c.students === 1 ? '' : 's'}
        </div>
        <div className="pov-cohort-bar">
          <div className="pov-cohort-track">
            <div
              className={`pov-cohort-fill ${chip.cls}`}
              style={{ width: `${c.completionPct}%` }}
            />
          </div>
          <span className={`pov-cohort-pct ${chip.cls}`}>{c.completionPct}%</span>
        </div>
      </div>
      <Link
        href={`/tutor/programme/${programmeId}/cohorts?cohort=${c.cohortId}`}
        className={`pov-cohort-btn${watch ? ' is-watch' : ''}`}
      >
        {watch ? 'Review →' : 'Open →'}
      </Link>
    </div>
  );
}

// ── Enrolment health panel (SELF_PACED) ──────────────────────────────
function EnrolmentHealthPanel({
  health,
  programmeId,
}: {
  health: EnrolmentHealth;
  programmeId: string;
}) {
  const tiles: Array<{ label: string; value: number; cls: string }> = [
    { label: 'Active', value: health.active, cls: '' },
    { label: 'Overdue', value: health.overdue, cls: 'is-danger' },
    { label: 'Paused', value: health.paused, cls: '' },
    { label: 'Expired', value: health.expired, cls: 'is-muted' },
  ];
  return (
    <div className="pov-panel">
      <div className="pov-panel-head">
        <div className="pov-panel-title">
          <span className="pov-panel-ic">
            <Icon name="users" size={13} />
          </span>
          Enrolment health
        </div>
        <Link
          href={`/tutor/programme/${programmeId}/enrolments`}
          className="pov-panel-link"
        >
          Manage →
        </Link>
      </div>
      <div className="pov-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={`pov-tile ${t.cls}`}>
            <div className="pov-tile-val">{t.value}</div>
            <div className="pov-tile-label">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="pov-recent-eyebrow">Recently enrolled</div>
      {health.recent.length === 0 ? (
        <p className="pov-panel-empty">No enrolments yet.</p>
      ) : (
        <div className="pov-recent-list">
          {health.recent.map((r) => {
            const meta = ENROLMENT_STATUS_META[r.status];
            return (
              <div key={r.enrolmentId} className="pov-recent">
                <span className="pov-avatar">{r.initials}</span>
                <div className="pov-recent-body">
                  <div className="pov-recent-name">{r.name}</div>
                  <div className="pov-recent-sub">
                    {r.agoLabel}
                    {r.detail ? ` · ${r.detail}` : ''}
                  </div>
                </div>
                <span className={`enrol-pill ${meta.pillClass}`}>{meta.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Enquiries panel (both modes) ─────────────────────────────────────
function EnquiriesPanel({
  enquiries,
  openCount,
  programmeId,
}: {
  enquiries: EnquiryPreview[];
  openCount: number;
  programmeId: string;
}) {
  const enquiriesHref = `/tutor/enquiries?programme=${programmeId}`;
  return (
    <div className="pov-panel">
      <div className="pov-panel-head">
        <div className="pov-panel-title">
          <span className="pov-panel-ic pov-panel-ic--amber">
            <Icon name="mail" size={13} />
          </span>
          Enquiries
          {openCount > 0 && (
            <span className="pov-panel-count pov-panel-count--amber">
              {openCount} open
            </span>
          )}
        </div>
        <Link href={enquiriesHref} className="pov-panel-link">
          View all →
        </Link>
      </div>
      {enquiries.length === 0 ? (
        <p className="pov-panel-empty">No open enquiries right now.</p>
      ) : (
        <div className="pov-enq-list">
          {enquiries.map((e) => (
            <div key={e.enquiryId} className="pov-enq">
              {e.fresh && <span className="pov-enq-dot" aria-hidden="true" />}
              <span className="pov-avatar">{e.initials}</span>
              <div className="pov-enq-body">
                <div className="pov-enq-top">
                  <span className="pov-enq-name">{e.name}</span>
                  <span className="pov-enq-ago">{e.agoLabel}</span>
                </div>
                <p className="pov-enq-msg">{e.message}</p>
                <Link href={enquiriesHref} className="pov-panel-link">
                  Reply →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
