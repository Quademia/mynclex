// mynclex/app/(app)/admin/enquiries/admin-enquiries-board.tsx
//
// Admin cross-programme operations dashboard (Slice 8 UI rebuild — V1).
//
// Three stacked sections:
//   1. KPI strip — 4 cards (Volume this week / Hot leads waiting /
//      Avg first response / Conversion rate). Each has a value, a
//      delta vs the previous period, and an inline 8-week sparkline.
//      The hot-leads card carries a red corner flag when there are
//      NEW leads ≥24h old (the SLA breach).
//   2. Insights row — Tutor SLA scoreboard (left, larger) + Channel
//      mix donut + insight callout (right). The scoreboard sorts
//      tutors by open volume → total volume → name so "who needs my
//      attention now" surfaces first.
//   3. Filterable table — Lead / Programme · Tutor / Channels / Age /
//      Status / SLA badge / Actions. Status, programme, tutor selects
//      derive from the loaded data (no extra queries). The actions
//      cell is one "Open in tutor view ↗" link — status writes don't
//      live here.
//
// All filters are client-side derivatives of the fetched rows. The
// stats KPI block and scoreboard are computed server-side via
// computeAdminStats and don't change with filtering (filters affect
// only the table; the KPIs describe the whole population).

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ContactChannel } from '@/lib/discovery/contact-options';
import { channelLabel, statusPill, urgencyTier } from '@/lib/enquiries/format';
import type { EnquiryStatus } from '@/lib/enquiries/types';
import type {
  AdminEnquiryStats,
  TutorScoreRow,
} from '@/lib/enquiries/aggregations';

export type AdminEnquiryRow = {
  enquiry_id: string;
  programme_id: string;
  programme_title: string;
  tutor_name: string | null;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact: ContactChannel[];
  message: string | null;
  status: EnquiryStatus;
  contacted_at: string | null;
  converted_enrolment_id: string | null;
  admin_notes: string | null;
  created_at: string;
};

type StatusFilter = 'OPEN' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED' | 'ALL';

const OPEN_STATUSES: ReadonlySet<EnquiryStatus> = new Set(['NEW', 'CONTACTED']);

// ─────────────────────────────────────────────────────────────────
// Top-level board
// ─────────────────────────────────────────────────────────────────

export function AdminEnquiriesBoard({
  rows,
  stats,
}: {
  rows: AdminEnquiryRow[];
  stats: AdminEnquiryStats;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [programmeId, setProgrammeId] = useState<string>('ALL');
  const [tutorName, setTutorName] = useState<string>('ALL');

  // Distinct programme + tutor options surfaced from the data.
  const programmeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.programme_id)) seen.set(r.programme_id, r.programme_title);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const tutorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tutor_name) set.add(r.tutor_name);
    return Array.from(set).sort();
  }, [rows]);

  // Status counts per the full data set (toolbar selects show "Open (4)" etc).
  const statusCounts = useMemo(() => {
    let nNew = 0, nCon = 0, nConv = 0, nClosed = 0;
    for (const r of rows) {
      if (r.status === 'NEW') nNew++;
      else if (r.status === 'CONTACTED') nCon++;
      else if (r.status === 'CONVERTED') nConv++;
      else nClosed++;
    }
    return { OPEN: nNew + nCon, NEW: nNew, CONTACTED: nCon, CONVERTED: nConv, CLOSED: nClosed, ALL: rows.length };
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter === 'OPEN' && !OPEN_STATUSES.has(r.status)) return false;
        if (statusFilter !== 'OPEN' && statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        if (programmeId !== 'ALL' && r.programme_id !== programmeId) return false;
        if (tutorName !== 'ALL' && r.tutor_name !== tutorName) return false;
        return true;
      }),
    [rows, statusFilter, programmeId, tutorName],
  );

  const channelMixTotal =
    stats.channelMix.WHATSAPP + stats.channelMix.CALL + stats.channelMix.SMS + stats.channelMix.EMAIL;

  return (
    <div className="ao-wrap">
      <KpiStrip stats={stats} />

      <div className="ao-insights">
        <TutorScoreboard rows={stats.tutorRows} />
        <ChannelMix mix={stats.channelMix} total={channelMixTotal} />
      </div>

      <section className="ao-table-section">
        <div className="ao-table-toolbar">
          <strong className="ao-table-title">All enquiries</strong>
          <span className="ao-table-count">{filtered.length} shown</span>
          <span className="ao-toolbar-spacer" />
          <select
            className="ao-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="OPEN">Open ({statusCounts.OPEN})</option>
            <option value="NEW">New ({statusCounts.NEW})</option>
            <option value="CONTACTED">Contacted ({statusCounts.CONTACTED})</option>
            <option value="CONVERTED">Converted ({statusCounts.CONVERTED})</option>
            <option value="CLOSED">Closed ({statusCounts.CLOSED})</option>
            <option value="ALL">All ({statusCounts.ALL})</option>
          </select>
          {programmeOptions.length > 1 && (
            <select
              className="ao-select"
              value={programmeId}
              onChange={(e) => setProgrammeId(e.target.value)}
              aria-label="Filter by programme"
            >
              <option value="ALL">All programmes</option>
              {programmeOptions.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          )}
          {tutorOptions.length > 1 && (
            <select
              className="ao-select"
              value={tutorName}
              onChange={(e) => setTutorName(e.target.value)}
              aria-label="Filter by tutor"
            >
              <option value="ALL">All tutors</option>
              {tutorOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        <EnquiriesTable rows={filtered} />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// KPI strip — 4 cards w/ sparklines + breach flag
// ─────────────────────────────────────────────────────────────────

function KpiStrip({ stats }: { stats: AdminEnquiryStats }) {
  const k = stats.kpis;

  const volumeDelta = k.volumeLastWeek === 0
    ? null
    : Math.round(((k.volumeThisWeek - k.volumeLastWeek) / k.volumeLastWeek) * 100);

  const responseDelta = k.avgFirstResponseSec != null && k.avgFirstResponsePrevSec != null
    ? Math.round((k.avgFirstResponseSec - k.avgFirstResponsePrevSec) / 3600 * 10) / 10
    : null;
  const responseValue = formatResponseHours(k.avgFirstResponseSec);

  const conversionPct = k.conversionRate == null ? null : Math.round(k.conversionRate * 100);
  const conversionDeltaPp =
    k.conversionRate != null && k.conversionRatePrev != null
      ? Math.round((k.conversionRate - k.conversionRatePrev) * 100)
      : null;

  return (
    <div className="ao-kpi">
      <KpiCard
        label="Volume this week"
        value={String(k.volumeThisWeek)}
        delta={volumeDelta == null ? null : {
          label: `${volumeDelta >= 0 ? '+' : ''}${volumeDelta}% vs last week`,
          good: volumeDelta >= 0,
        }}
        spark={{ points: k.weeklySpark, color: '#2d7d72' }}
        flag={k.breach24hCount > 0 ? `${k.breach24hCount} BREACH${k.breach24hCount > 1 ? 'ES' : ''}` : null}
      />
      <KpiCard
        label="Hot leads waiting"
        value={String(k.hotWaiting)}
        valueTone={k.hotWaiting > 0 ? 'danger' : undefined}
        delta={null}
        spark={{ points: k.hotWaitingSpark, color: '#dc2626' }}
        subline={k.hotWaiting === 0 ? 'All caught up' : 'Under 4h old, still open'}
      />
      <KpiCard
        label="Avg first response"
        value={responseValue.value}
        unit={responseValue.unit}
        delta={responseDelta == null ? null : {
          // Faster is better — flip the sign for the visual cue.
          label: `${responseDelta <= 0 ? '↓' : '↑'} ${Math.abs(responseDelta)}h ${responseDelta <= 0 ? 'faster' : 'slower'}`,
          good: responseDelta <= 0,
        }}
        spark={{ points: k.avgResponseSpark, color: '#2d7d72' }}
      />
      <KpiCard
        label="Conversion rate"
        value={conversionPct == null ? '—' : String(conversionPct)}
        unit={conversionPct == null ? '' : '%'}
        delta={conversionDeltaPp == null ? null : {
          label: `${conversionDeltaPp >= 0 ? '+' : ''}${conversionDeltaPp} pp this month`,
          good: conversionDeltaPp >= 0,
        }}
        spark={{ points: k.conversionSpark.map((p) => p * 100), color: '#1e3a5f' }}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueTone,
  unit,
  delta,
  spark,
  flag,
  subline,
}: {
  label: string;
  value: string;
  valueTone?: 'danger';
  unit?: string;
  delta: { label: string; good: boolean } | null;
  spark: { points: number[]; color: string };
  flag?: string | null;
  subline?: string;
}) {
  return (
    <div className="ao-kpi-card">
      {flag && <div className="ao-kpi-flag">{flag}</div>}
      <div className="ao-kpi-label">{label}</div>
      <div className={`ao-kpi-value${valueTone === 'danger' ? ' is-danger' : ''}`}>
        {value}
        {unit && <span className="ao-kpi-unit">{unit}</span>}
      </div>
      {delta && (
        <div className={`ao-kpi-delta ${delta.good ? 'up' : 'down'}`}>
          {delta.label}
        </div>
      )}
      {subline && !delta && <div className="ao-kpi-subline">{subline}</div>}
      <div className="ao-kpi-spark">
        <Sparkline points={spark.points} color={spark.color} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sparkline + Donut — inline SVG, no library dependency
// ─────────────────────────────────────────────────────────────────

function Sparkline({
  points,
  color,
  width = 60,
  height = 22,
}: {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const d = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="ao-sparkline" width={width} height={height} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Donut({
  slices,
  size = 110,
}: {
  slices: { value: number; color: string }[];
  size?: number;
}) {
  const r = size / 2 - 8;
  const c = size / 2;
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#eef0f3" strokeWidth="14" />
      </svg>
    );
  }
  const circumference = 2 * Math.PI * r;
  // Pre-compute each slice's rotation offset + dash length in one pass
  // — keeps the render JSX a pure map with no per-iteration mutation
  // (React 19 strict immutability rule).
  const rendered = slices.reduce<
    { rotated: { len: number; rot: number; color: string }[]; offset: number }
  >(
    (acc, s) => {
      if (s.value === 0) return acc;
      const len = (s.value / total) * circumference;
      const rot = -90 + (acc.offset / circumference) * 360;
      return {
        rotated: [...acc.rotated, { len, rot, color: s.color }],
        offset: acc.offset + len,
      };
    },
    { rotated: [], offset: 0 },
  ).rotated;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#eef0f3" strokeWidth="14" />
      {rendered.map((s, i) => (
        <circle
          key={i}
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth="14"
          strokeDasharray={`${s.len} ${circumference}`}
          strokeLinecap="butt"
          transform={`rotate(${s.rot} ${c} ${c})`}
        />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tutor SLA scoreboard
// ─────────────────────────────────────────────────────────────────

function TutorScoreboard({ rows }: { rows: TutorScoreRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="ao-panel">
        <div className="ao-panel-head">
          <span className="ao-panel-title">Tutor SLA scoreboard</span>
        </div>
        <p className="ao-panel-empty">No tutor activity yet.</p>
      </div>
    );
  }

  return (
    <div className="ao-panel">
      <div className="ao-panel-head">
        <span className="ao-panel-title">Tutor SLA scoreboard</span>
        <span className="ao-panel-sub">Last 30 days · sorted by open work then volume</span>
      </div>
      <div className="ao-tutor-row head">
        <span>Tutor</span>
        <span>Volume</span>
        <span>Open</span>
        <span>Avg reply</span>
        <span>Convert</span>
      </div>
      {rows.map((r) => (
        <TutorScoreboardRow key={r.tutorName} row={r} />
      ))}
    </div>
  );
}

function TutorScoreboardRow({ row }: { row: TutorScoreRow }) {
  const convPct = row.conversionRate == null ? null : Math.round(row.conversionRate * 100);
  const convTone =
    convPct == null ? '' :
    convPct > 50 ? 'is-good' :
    convPct < 20 ? 'is-bad' : '';
  const avgHrs = row.avgReplySec == null ? null : Math.round((row.avgReplySec / 3600) * 10) / 10;
  const slaPct = avgHrs == null ? 0 : Math.min(100, (avgHrs / 24) * 100);
  const openTone = row.open > 3 ? 'is-danger' : '';
  const oldestLabel = row.open === 0
    ? '— none'
    : row.oldestOpenHours == null
      ? `${row.open} open`
      : `${row.open} · oldest ${row.oldestOpenHours}h`;

  return (
    <div className="ao-tutor-row">
      <div className="ao-tutor-name">
        <div className="ao-tutor-avatar">{tutorInitials(row.tutorName)}</div>
        <span className="ao-tutor-name-text">{row.tutorName}</span>
      </div>
      <span className="ao-tutor-cell">{row.volume}</span>
      <span className={`ao-tutor-cell ${openTone}`}>{oldestLabel}</span>
      <span className="ao-tutor-cell">
        <div className="ao-tutor-reply">
          <span className="ao-tutor-reply-value">
            {avgHrs == null ? '—' : `${avgHrs}h`}
          </span>
          {avgHrs != null && (
            <div className="ao-tutor-bar">
              <div
                className={`ao-tutor-bar-fill ${row.slaTier}`}
                style={{ width: `${slaPct}%` }}
              />
            </div>
          )}
        </div>
      </span>
      <span className={`ao-tutor-cell ${convTone}`}>
        {convPct == null ? '—' : `${convPct}%`}
      </span>
    </div>
  );
}

function tutorInitials(name: string): string {
  if (name === '—') return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────
// Channel mix donut + legend + insight callout
// ─────────────────────────────────────────────────────────────────

const CHANNEL_COLOR: Record<ContactChannel, string> = {
  WHATSAPP: '#25D366',
  CALL:     '#2563eb',
  SMS:      '#7c3aed',
  EMAIL:    '#9ca3af',
};

function ChannelMix({
  mix,
  total,
}: {
  mix: Record<ContactChannel, number>;
  total: number;
}) {
  // Largest slice for the donut center label.
  const channels: ContactChannel[] = ['WHATSAPP', 'CALL', 'SMS', 'EMAIL'];
  const slices = channels.map((ch) => ({ value: mix[ch], color: CHANNEL_COLOR[ch] }));
  const top = channels.reduce<{ ch: ContactChannel; pct: number } | null>((acc, ch) => {
    if (total === 0) return acc;
    const pct = Math.round((mix[ch] / total) * 100);
    if (!acc || pct > acc.pct) return { ch, pct };
    return acc;
  }, null);

  return (
    <div className="ao-panel">
      <div className="ao-panel-head">
        <span className="ao-panel-title">Channel mix</span>
        <span className="ao-panel-sub">Preferred contact</span>
      </div>
      <div className="ao-donut-wrap">
        <div className="ao-donut">
          <Donut slices={slices} size={110} />
          <div className="ao-donut-center">
            {top && total > 0 ? (
              <>
                <span className="ao-donut-center-value">{top.pct}%</span>
                <span>{channelLabel(top.ch)}</span>
              </>
            ) : (
              <span className="ao-donut-center-empty">No leads</span>
            )}
          </div>
        </div>
        <div className="ao-donut-legend">
          {channels.map((ch) => {
            const pct = total === 0 ? 0 : Math.round((mix[ch] / total) * 100);
            return (
              <div key={ch} className="ao-donut-legend-row">
                <span className="ao-donut-swatch" style={{ background: CHANNEL_COLOR[ch] }} />
                <span>{channelLabel(ch)}</span>
                <span className="ao-donut-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      {total > 0 && (
        <p className="ao-insight">
          <strong>Insight:</strong> WhatsApp leads the channel mix for this
          audience — replies under 4 hours convert noticeably more often.
          Watch the SLA scoreboard for tutors slipping past the 4-hour mark.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Filterable table
// ─────────────────────────────────────────────────────────────────

function EnquiriesTable({ rows }: { rows: AdminEnquiryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="ao-table ao-table-empty">
        No enquiries match these filters.
      </div>
    );
  }
  return (
    <div className="ao-table">
      <div className="ao-table-row head">
        <span>Lead</span>
        <span>Programme · Tutor</span>
        <span>Channels</span>
        <span>Age</span>
        <span>Status</span>
        <span>SLA</span>
        <span className="ao-th-actions">Actions</span>
      </div>
      {rows.map((r) => (
        <TableRow key={r.enquiry_id} row={r} />
      ))}
    </div>
  );
}

function TableRow({ row }: { row: AdminEnquiryRow }) {
  const pill = statusPill(row.status);
  const sla = slaForRow(row);
  const tutorHref = `/tutor/programme/${row.programme_id}/enquiries`;
  return (
    <div className="ao-table-row body">
      <div className="ao-cell-lead">
        <div className="ao-tutor-avatar ao-lead-avatar">{tutorInitials(row.name)}</div>
        <div className="ao-cell-lead-text">
          <div className="ao-cell-lead-name">{row.name}</div>
          <div className="ao-cell-lead-email">{row.email}</div>
        </div>
      </div>
      <div className="ao-cell-programme">
        <div className="ao-cell-programme-title">{row.programme_title}</div>
        <div className="ao-cell-programme-tutor">{row.tutor_name ?? '—'}</div>
      </div>
      <div className="ao-cell-channels">
        {row.preferred_contact.map((ch) => (
          <span
            key={ch}
            className={`ao-chan${ch === 'WHATSAPP' ? ' ao-chan-whatsapp' : ''}`}
            title={channelLabel(ch)}
          >
            {channelLabel(ch)}
          </span>
        ))}
      </div>
      <div className="ao-cell-age">{relTime(row.created_at)}</div>
      <div>
        <span className={`ao-pill ao-pill-${pill.tone}`}>{pill.label}</span>
      </div>
      <div>
        <span className={`ao-sla ao-sla-${sla.kind}`}>{sla.label}</span>
      </div>
      <div className="ao-cell-actions">
        <Link className="ao-action-link" href={tutorHref} title="Open in tutor view">
          Open ↗
        </Link>
      </div>
    </div>
  );
}

// SLA badge per row — mirrors the design's slaForAge helper.
//   CONVERTED/CLOSED → na ('—')
//   CONTACTED        → ok ('In progress')
//   NEW + <4h        → ok ('On track')
//   NEW + <24h       → warn ('Xh waiting')
//   NEW + ≥24h       → breach ('SLA breach · Xh')
function slaForRow(r: AdminEnquiryRow): { kind: 'ok' | 'warn' | 'breach' | 'na'; label: string } {
  if (r.status === 'CONVERTED' || r.status === 'CLOSED') return { kind: 'na', label: '—' };
  if (r.status === 'CONTACTED') return { kind: 'ok', label: 'In progress' };
  const hours = (Date.now() - new Date(r.created_at).getTime()) / 3_600_000;
  if (hours < 4) return { kind: 'ok', label: 'On track' };
  if (hours < 24) return { kind: 'warn', label: `${Math.round(hours)}h waiting` };
  return { kind: 'breach', label: `SLA breach · ${Math.round(hours)}h` };
}

// ─────────────────────────────────────────────────────────────────
// Helpers (kept here rather than in lib/enquiries so the lib stays
// data-shaped; these are presentation-only)
// ─────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatResponseHours(seconds: number | null): { value: string; unit: string } {
  if (seconds == null) return { value: '—', unit: '' };
  const hours = seconds / 3600;
  if (hours < 1) {
    const mins = Math.round(seconds / 60);
    return { value: String(mins), unit: 'min' };
  }
  if (hours < 24) return { value: hours.toFixed(1), unit: 'hrs' };
  return { value: (hours / 24).toFixed(1), unit: 'days' };
}

// Suppress an "unused" warning — urgencyTier is needed if we ever
// want a row-level urgency strip; kept imported for symmetry with
// the tutor surface.
void urgencyTier;
