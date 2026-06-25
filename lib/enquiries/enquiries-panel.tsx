// mynclex/lib/enquiries/enquiries-panel.tsx
//
// Tutor enquiry queue UI (Slice 8 — V1 polished inbox, CD-driven rebuild).
// Shared by the per-programme tab AND the global /tutor/enquiries inbox
// (2026-06-25). The programme dimension is ADDITIVE: pass `showProgramme`
// + `programmes` to get a programme column + filter (global inbox); omit
// them and it renders exactly as the per-programme tab always did.
//
// Three sections stacked vertically:
//   1. KPI strip — 5 cards (Needs reply now / Open / Avg response / Converted /
//      Top channel). Read straight from computeTutorStats on the server.
//   2. Toolbar — filter chips + (global) programme filter + free-text search.
//   3. Split — day-grouped list (left, urgency strip per row) + detail pane
//      (right): head + reply bar + message + quick replies + notes + footer.
//
// The reply bar is the key UX win over the previous version: clicking
// WhatsApp / Call / Email opens the channel deep-link AND auto-marks the
// lead as Contacted in the same click. Today's separate two-step
// (reach-out then mark-contacted) becomes one.
//
// Notes auto-save with a 800ms debounce.
//
// All data flows from the rows fetched once on the server; selection +
// filter + search + notes-draft are pure client state. The status actions
// key off enquiry_id (programme-agnostic) + re-check ownership server-side,
// so the same actions serve both the per-programme and global surfaces.

'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  markContactedAction,
  markClosedAction,
  saveAdminNotesAction,
} from '@/lib/enquiries/actions';
import {
  channelLabel,
  statusPill,
  urgencyTier,
  URGENCY_META,
} from '@/lib/enquiries/format';
import type { Enquiry, EnquiryStatus } from '@/lib/enquiries/types';
import type { TutorEnquiryStats } from '@/lib/enquiries/aggregations';
import type { ContactChannel } from '@/lib/discovery/contact-options';
import { QUICK_REPLY_TEMPLATES, renderTemplate, type QuickReplyTemplate } from '@/lib/enquiries/templates';

// A row the panel can render. The global inbox carries the parent
// programme's title (for the column + filter + quick-reply context); the
// per-programme page leaves it undefined.
type PanelEnquiry = Enquiry & { programme_title?: string };

type FilterKey = 'OPEN' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED' | 'ALL';

const OPEN_STATUSES: ReadonlySet<EnquiryStatus> = new Set(['NEW', 'CONTACTED']);

function matchesFilter(e: PanelEnquiry, filter: FilterKey): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'OPEN') return OPEN_STATUSES.has(e.status);
  return e.status === filter;
}

function matchesSearch(e: PanelEnquiry, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    e.name.toLowerCase().includes(needle) ||
    e.email.toLowerCase().includes(needle) ||
    (e.message ?? '').toLowerCase().includes(needle)
  );
}

// Relative-time formatter — matches the design handoff's thresholds.
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

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

// Day-bucket label for the list group headers.
type DayBucket = 'Today' | 'Yesterday' | 'This week' | 'Older';
function dayBucket(iso: string): DayBucket {
  const h = hoursSince(iso);
  if (h < 24) return 'Today';
  if (h < 48) return 'Yesterday';
  if (h < 168) return 'This week';
  return 'Older';
}

// Initials from a full name — 1-2 characters, uppercase.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Format avg-response seconds as a friendly "Xh" / "Xm" string.
function formatResponseTime(seconds: number | null): { value: string; unit: string } {
  if (seconds == null) return { value: '—', unit: '' };
  const minutes = seconds / 60;
  if (minutes < 60) return { value: String(Math.round(minutes)), unit: 'min' };
  const hours = minutes / 60;
  if (hours < 24) return { value: hours.toFixed(1), unit: 'hrs' };
  return { value: (hours / 24).toFixed(1), unit: 'days' };
}

// Delta between current + previous response averages, expressed in hours.
// `null` when either side is missing (no comparison possible).
function responseDelta(curr: number | null, prev: number | null): { hours: number; better: boolean } | null {
  if (curr == null || prev == null) return null;
  const hours = (curr - prev) / 3600;
  return { hours: Math.abs(hours), better: hours < 0 };
}

// Pre-existing icon components used by the reply bar. Inline SVGs keep
// the panel self-contained — no icon library dependency.
function Icon({ name, className }: { name: 'whatsapp' | 'phone' | 'mail' | 'check' | 'x' | 'search'; className?: string }) {
  const paths: Record<typeof name, React.ReactNode> = {
    whatsapp: <><path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.5A9 9 0 1 1 21 12Z" /><path d="M8.5 9.5c0 4 3 7 7 7M8.5 9.5c0-1 .5-1.5 1.5-1.5l1.5 2-1 1c.5 1 1.5 2 2.5 2.5l1-1 2 1.5c0 1-.5 1.5-1.5 1.5" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.6 3a2 2 0 0 1-.6 2L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.6l3 .6a2 2 0 0 1 1.7 2Z" />,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// =========================================================
// Top-level panel
// =========================================================

export function EnquiriesPanel({
  enquiries,
  stats,
  showProgramme = false,
  emptyMessage,
}: {
  enquiries: PanelEnquiry[];
  stats: TutorEnquiryStats;
  // Global inbox: render a per-row programme label + thread the programme
  // name into quick replies. The per-programme page omits it and renders
  // unchanged. The PROGRAMME scope itself lives one level up (the header
  // picker drives ?programme=), so the panel always renders the set it's
  // handed. `emptyMessage` overrides the "no enquiries at all" copy — the
  // global page passes a programme-named one when scoped to a lead-free
  // programme.
  showProgramme?: boolean;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('OPEN');
  const [query, setQuery] = useState('');
  // Manual selection override. null means "use the natural first-row
  // pick from the active filter" — derived below.
  const [selectedIdRaw, setSelectedIdRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    let nNew = 0, nContacted = 0, nConv = 0, nClosed = 0;
    for (const e of enquiries) {
      if (e.status === 'NEW') nNew++;
      else if (e.status === 'CONTACTED') nContacted++;
      else if (e.status === 'CONVERTED') nConv++;
      else nClosed++;
    }
    return {
      OPEN: nNew + nContacted,
      NEW: nNew,
      CONTACTED: nContacted,
      CONVERTED: nConv,
      CLOSED: nClosed,
      ALL: enquiries.length,
    };
  }, [enquiries]);

  const shown = useMemo(
    () => enquiries.filter((e) => matchesFilter(e, filter) && matchesSearch(e, query)),
    [enquiries, filter, query],
  );

  // Effective selection: honour the user's pick when it's still in the
  // visible set; otherwise fall back to the natural first row. Derived,
  // not stored — avoids the setState-inside-effect cascade pattern.
  const selectedId = useMemo<string | null>(() => {
    if (shown.length === 0) return null;
    if (selectedIdRaw && shown.some((e) => e.enquiry_id === selectedIdRaw)) {
      return selectedIdRaw;
    }
    return shown[0].enquiry_id;
  }, [shown, selectedIdRaw]);

  const selected = useMemo(
    () => enquiries.find((e) => e.enquiry_id === selectedId) ?? null,
    [enquiries, selectedId],
  );

  const setSelectedId = setSelectedIdRaw;

  // Run a server action under the action transition. Errors surface in
  // the toast; on success the route refreshes so re-derivations pick up
  // the new status.
  function runAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    if (actionPending) return;
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  // Reply-bar shared behaviour: open a channel + flip to CONTACTED. The
  // server action errors with "only new" when already CONTACTED; we
  // suppress that since the channel-open is the main action.
  function openChannelAndMarkContacted(href: string, enquiry: PanelEnquiry) {
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    if (enquiry.status === 'NEW') {
      // Fire-and-forget — surface only "real" errors.
      startTransition(async () => {
        const res = await markContactedAction(enquiry.enquiry_id);
        if (!res.ok && !res.error.includes('Only new')) {
          setError(res.error);
          return;
        }
        router.refresh();
      });
    }
  }

  const chips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'OPEN',      label: 'Open',      count: counts.OPEN      },
    { key: 'NEW',       label: 'New',       count: counts.NEW       },
    { key: 'CONTACTED', label: 'Contacted', count: counts.CONTACTED },
    { key: 'CONVERTED', label: 'Converted', count: counts.CONVERTED },
    { key: 'CLOSED',    label: 'Closed',    count: counts.CLOSED    },
    { key: 'ALL',       label: 'All',       count: counts.ALL       },
  ];

  return (
    <div className="ti-wrap">
      <KpiStrip stats={stats} />

      <div className="ti-toolbar">
        <div className="ti-toolbar-chips">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`ti-chip${filter === c.key ? ' on' : ''}`}
              onClick={() => setFilter(c.key)}
            >
              {c.label} <span className="ti-chip-count">{c.count}</span>
            </button>
          ))}
        </div>
        <label className="ti-search">
          <Icon name="search" className="ti-search-icon" />
          <input
            type="text"
            placeholder="Search name, email, message…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </label>
      </div>

      <div className="ti-split">
        <aside className="ti-list-col" aria-label="Enquiry list">
          <EnquiryList
            rows={shown}
            selectedId={selectedId}
            onSelect={setSelectedId}
            totalCount={enquiries.length}
            showProgramme={showProgramme}
            emptyMessage={emptyMessage}
          />
        </aside>
        <section className="ti-detail-col" aria-label="Enquiry detail">
          {selected ? (
            <EnquiryDetail
              enquiry={selected}
              showProgramme={showProgramme}
              pending={actionPending}
              onOpenChannel={(href) => openChannelAndMarkContacted(href, selected)}
              onMarkContactedOnly={() => runAction(() => markContactedAction(selected.enquiry_id))}
              onMarkClosed={() => runAction(() => markClosedAction(selected.enquiry_id))}
              onSaveNotes={(notes) => runAction(() => saveAdminNotesAction(selected.enquiry_id, notes))}
            />
          ) : (
            <div className="ti-detail-empty">
              {enquiries.length === 0
                ? 'No enquiries to show yet.'
                : shown.length === 0
                  ? 'Nothing matches the current filter.'
                  : 'Select an enquiry on the left.'}
            </div>
          )}
        </section>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

// =========================================================
// KPI strip
// =========================================================

function KpiStrip({ stats }: { stats: TutorEnquiryStats }) {
  const resp = formatResponseTime(stats.avgResponseSec);
  const delta = responseDelta(stats.avgResponseSec, stats.avgResponsePrevSec);
  const convRatePct = stats.conversionRate30d == null ? null : Math.round(stats.conversionRate30d * 100);
  const channelMixTotal =
    stats.channelMix.WHATSAPP + stats.channelMix.CALL + stats.channelMix.SMS + stats.channelMix.EMAIL;
  const topChannelPct =
    stats.topChannel == null || channelMixTotal === 0
      ? null
      : Math.round((stats.channelMix[stats.topChannel] / channelMixTotal) * 100);

  return (
    <div className="ti-stats">
      <div className={`ti-stat${stats.hotCount > 0 ? ' is-hot' : ''}`}>
        <div className="ti-stat-label">Needs reply now</div>
        <div className="ti-stat-value">
          {stats.hotCount}
          <span className="ti-stat-unit">under 4h</span>
        </div>
        <div className="ti-stat-sub">
          {stats.hotCount === 0 ? 'You’re caught up.' : 'Hot leads waiting'}
        </div>
      </div>

      <div className="ti-stat">
        <div className="ti-stat-label">Open</div>
        <div className="ti-stat-value">{stats.open.total}</div>
        <div className="ti-stat-sub">
          {stats.open.new} new · {stats.open.contacted} in progress
        </div>
      </div>

      <div className="ti-stat">
        <div className="ti-stat-label">Avg response time</div>
        <div className="ti-stat-value">
          {resp.value}
          {resp.unit && <span className="ti-stat-unit">{resp.unit}</span>}
        </div>
        <div className={`ti-stat-sub${delta ? (delta.better ? ' is-good' : ' is-bad') : ''}`}>
          {delta ? (
            delta.better
              ? `↓ ${delta.hours.toFixed(1)}h vs prev 30 days`
              : `↑ ${delta.hours.toFixed(1)}h vs prev 30 days`
          ) : 'Last 30 days'}
        </div>
      </div>

      <div className="ti-stat">
        <div className="ti-stat-label">Converted this month</div>
        <div className="ti-stat-value">{stats.convertedThisMonth}</div>
        <div className="ti-stat-sub">
          {convRatePct == null ? 'No leads yet' : `${convRatePct}% conversion rate (30d)`}
        </div>
      </div>

      <div className="ti-stat">
        <div className="ti-stat-label">Top channel</div>
        <div className="ti-stat-value ti-stat-channel">
          {stats.topChannel ? (
            <>
              <span className={`ti-stat-channel-icon ti-stat-channel-${stats.topChannel.toLowerCase()}`} aria-hidden="true">
                {stats.topChannel === 'WHATSAPP' && <Icon name="whatsapp" className="ti-stat-channel-svg" />}
                {stats.topChannel === 'CALL' && <Icon name="phone" className="ti-stat-channel-svg" />}
                {stats.topChannel === 'EMAIL' && <Icon name="mail" className="ti-stat-channel-svg" />}
                {stats.topChannel === 'SMS' && <span className="ti-stat-channel-letter">S</span>}
              </span>
              <span>{channelLabel(stats.topChannel)}</span>
            </>
          ) : (
            '—'
          )}
        </div>
        <div className="ti-stat-sub">
          {topChannelPct == null ? 'No leads yet' : `${topChannelPct}% of leads prefer it`}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// List
// =========================================================

function EnquiryList({
  rows,
  selectedId,
  onSelect,
  totalCount,
  showProgramme,
  emptyMessage,
}: {
  rows: PanelEnquiry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  totalCount: number;
  showProgramme: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="ti-list-empty">
        {totalCount === 0
          ? (emptyMessage ??
            "No enquiries yet. They'll appear here when students send a message from a programme's public page.")
          : 'No enquiries match this filter or search.'}
      </div>
    );
  }

  // Group by day bucket, preserving the source order within each group.
  const groups: Record<DayBucket, PanelEnquiry[]> = {
    Today: [], Yesterday: [], 'This week': [], Older: [],
  };
  for (const e of rows) groups[dayBucket(e.created_at)].push(e);

  const orderedGroups: DayBucket[] = ['Today', 'Yesterday', 'This week', 'Older'];

  return (
    <ul className="ti-list">
      {orderedGroups.map((label) => {
        const groupRows = groups[label];
        if (groupRows.length === 0) return null;
        return (
          <li key={label} className="ti-list-group">
            <div className="ti-group-label">
              {label} <span className="ti-group-count">· {groupRows.length}</span>
            </div>
            <ul className="ti-list-rows">
              {groupRows.map((e) => (
                <EnquiryRow
                  key={e.enquiry_id}
                  enquiry={e}
                  active={e.enquiry_id === selectedId}
                  onSelect={() => onSelect(e.enquiry_id)}
                  showProgramme={showProgramme}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function EnquiryRow({
  enquiry,
  active,
  onSelect,
  showProgramme,
}: {
  enquiry: PanelEnquiry;
  active: boolean;
  onSelect: () => void;
  showProgramme: boolean;
}) {
  const tier = urgencyTier(enquiry.created_at, enquiry.status);
  const pill = statusPill(enquiry.status);
  const snippet = (enquiry.message ?? '').trim() || '(No message — contact details only)';

  return (
    <li>
      <button
        type="button"
        className={`ti-row${active ? ' is-active' : ''}`}
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
      >
        <span className={`ti-row-urgency ti-row-urgency-${tier}`} aria-hidden="true" />
        <span className="ti-row-body">
          <span className="ti-row-top">
            <span className="ti-row-name">{enquiry.name}</span>
            <span className="ti-row-when">{relTime(enquiry.created_at)}</span>
          </span>
          <span className="ti-row-snippet">{snippet}</span>
          {showProgramme && enquiry.programme_title && (
            <span className="ti-row-programme">{enquiry.programme_title}</span>
          )}
          <span className="ti-row-meta">
            <span className={`ti-pill ti-pill-${pill.tone}`}>{pill.label}</span>
            {enquiry.preferred_contact.slice(0, 2).map((ch) => (
              <span
                key={ch}
                className={`ti-chan${ch === 'WHATSAPP' ? ' ti-chan-whatsapp' : ''}`}
                title={channelLabel(ch)}
              >
                {ch === 'WHATSAPP' && <Icon name="whatsapp" className="ti-chan-icon" />}
                {ch === 'CALL' && <Icon name="phone" className="ti-chan-icon" />}
                {ch === 'EMAIL' && <Icon name="mail" className="ti-chan-icon" />}
                {ch === 'SMS' && <span className="ti-chan-letter">S</span>}
                {channelLabel(ch)}
              </span>
            ))}
            {enquiry.preferred_contact.length > 2 && (
              <span className="ti-chan ti-chan-more">+{enquiry.preferred_contact.length - 2}</span>
            )}
          </span>
        </span>
        {tier === 'hot' && (
          <span className="ti-row-hot-dot" aria-label="Hot lead" />
        )}
      </button>
    </li>
  );
}

// =========================================================
// Detail pane
// =========================================================

function EnquiryDetail({
  enquiry,
  showProgramme,
  pending,
  onOpenChannel,
  onMarkContactedOnly,
  onMarkClosed,
  onSaveNotes,
}: {
  enquiry: PanelEnquiry;
  showProgramme: boolean;
  pending: boolean;
  onOpenChannel: (href: string) => void;
  onMarkContactedOnly: () => void;
  onMarkClosed: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const tier = urgencyTier(enquiry.created_at, enquiry.status);
  const pill = statusPill(enquiry.status);
  const tierMeta = URGENCY_META[tier];
  const isTerminal = enquiry.status === 'CONVERTED' || enquiry.status === 'CLOSED';

  const hasWhatsApp = enquiry.preferred_contact.includes('WHATSAPP');
  const hasPhone = enquiry.phone != null && enquiry.phone.trim() !== '';

  // Deep-link builders. WhatsApp's web client accepts the phone number
  // sans leading + ; phone numbers in the DB are stored with the +,
  // so normalize.
  const waNumber = (enquiry.phone ?? '').replace(/\D/g, '');
  const buildWaHref = (text: string) =>
    `https://wa.me/${waNumber}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  const buildTelHref = () => `tel:${(enquiry.phone ?? '').replace(/\s+/g, '')}`;
  const buildMailHref = (subject: string, body: string) => {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const qs = params.toString();
    return `mailto:${enquiry.email}${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="ti-detail">
      <header className="ti-detail-head">
        <div className="ti-detail-id-row">
          <div className="ti-detail-avatar" aria-hidden="true">{initials(enquiry.name)}</div>
          <div className="ti-detail-name-block">
            <h2 className="ti-detail-name">
              {enquiry.name}
              <span className={`ti-pill ti-pill-${pill.tone}`}>{pill.label}</span>
            </h2>
            <div className="ti-detail-sub">
              <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>
              {hasPhone && (
                <>
                  <span className="ti-detail-sub-sep">·</span>
                  <a href={buildTelHref()}>{enquiry.phone}</a>
                </>
              )}
              <span className="ti-detail-sub-sep">·</span>
              <span>Received {relTime(enquiry.created_at)}</span>
              {enquiry.contacted_at && (
                <>
                  <span className="ti-detail-sub-sep">·</span>
                  <span>Contacted {relTime(enquiry.contacted_at)}</span>
                </>
              )}
              {showProgramme && enquiry.programme_title && (
                <>
                  <span className="ti-detail-sub-sep">·</span>
                  <span className="ti-detail-programme">{enquiry.programme_title}</span>
                </>
              )}
            </div>
            <div className="ti-detail-pills">
              {tier !== 'done' && (
                <span
                  className="ti-urgency-pill"
                  style={{ color: tierMeta.color, background: tierMeta.bg }}
                >
                  <span className="ti-urgency-dot" style={{ background: tierMeta.color }} />
                  {tierMeta.label.toUpperCase()}
                </span>
              )}
              <span className="ti-detail-prefers-label">Prefers:</span>
              {enquiry.preferred_contact.map((ch) => (
                <span
                  key={ch}
                  className={`ti-chan${ch === 'WHATSAPP' ? ' ti-chan-whatsapp' : ''}`}
                >
                  {ch === 'WHATSAPP' && <Icon name="whatsapp" className="ti-chan-icon" />}
                  {ch === 'CALL' && <Icon name="phone" className="ti-chan-icon" />}
                  {ch === 'EMAIL' && <Icon name="mail" className="ti-chan-icon" />}
                  {ch === 'SMS' && <span className="ti-chan-letter">S</span>}
                  {channelLabel(ch)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Reply bar — open channel + auto-mark-contacted in one click. */}
      {!isTerminal && (
        <div className="ti-reply-bar">
          <div className="ti-reply-bar-label">Reach out — auto-marks as contacted</div>
          <div className="ti-reply-bar-row">
            {hasWhatsApp && hasPhone && (
              <button
                type="button"
                className="ti-cta ti-cta-whatsapp ti-cta-preferred"
                onClick={() => onOpenChannel(buildWaHref(''))}
                disabled={pending}
              >
                <Icon name="whatsapp" className="ti-cta-icon" />
                WhatsApp {enquiry.name.split(/\s+/)[0]}
              </button>
            )}
            {hasPhone && (
              <button
                type="button"
                className="ti-cta ti-cta-call"
                onClick={() => onOpenChannel(buildTelHref())}
                disabled={pending}
              >
                <Icon name="phone" className="ti-cta-icon" />
                Call {enquiry.phone}
              </button>
            )}
            <button
              type="button"
              className="ti-cta ti-cta-email"
              onClick={() => onOpenChannel(buildMailHref('', ''))}
              disabled={pending}
            >
              <Icon name="mail" className="ti-cta-icon" />
              Send email
            </button>
            {enquiry.status === 'NEW' && (
              <button
                type="button"
                className="ti-cta ti-cta-ghost"
                onClick={onMarkContactedOnly}
                disabled={pending}
                title="Use when you've contacted the student off-platform (e.g. they messaged you separately)"
              >
                <Icon name="check" className="ti-cta-icon" />
                Mark contacted only
              </button>
            )}
          </div>
        </div>
      )}

      <div className="ti-body">
        {/* Message */}
        <div className="ti-section">
          <div className="ti-section-title">Message</div>
          {enquiry.message ? (
            <div className="ti-message">{enquiry.message}</div>
          ) : (
            <div className="ti-message">
              <span className="ti-message-empty">(No written message — they only sent contact details.)</span>
            </div>
          )}
        </div>

        {/* Quick replies */}
        {!isTerminal && (
          <QuickReplies
            enquiry={enquiry}
            disabled={pending}
            onPick={(href) => onOpenChannel(href)}
          />
        )}

        {/* Notes — auto-save. key= forces remount + state reset on enquiry
            switch (cleaner than reset-on-effect; React 19 strict purity). */}
        <NotesEditor
          key={enquiry.enquiry_id}
          initialNotes={enquiry.admin_notes ?? ''}
          onSave={onSaveNotes}
          pending={pending}
        />
      </div>

      <footer className="ti-footer">
        <span className="ti-footer-meta">Enquiry #{enquiry.enquiry_id.slice(-4).toUpperCase()}</span>
        {!isTerminal && (
          <button
            type="button"
            className="ti-btn-ghost"
            onClick={onMarkClosed}
            disabled={pending}
          >
            <Icon name="x" className="ti-footer-icon" />
            Close lead
          </button>
        )}
      </footer>
    </div>
  );
}

// =========================================================
// Quick replies — channel-aware deep-link composer
// =========================================================

function QuickReplies({
  enquiry,
  disabled,
  onPick,
}: {
  enquiry: PanelEnquiry;
  disabled: boolean;
  onPick: (href: string) => void;
}) {
  // Programme name comes through on the global inbox (per-programme page
  // leaves it blank); the tutor name still threads in later. Template
  // placeholders fall back gracefully when a value isn't populated.
  const ctx = {
    name: enquiry.name.split(/\s+/)[0] ?? enquiry.name,
    tutor: '',           // filled in later when we thread tutor name through
    programme: enquiry.programme_title ?? '',
  };

  // Pick the best channel to open for a template, given the lead's
  // preferred channels. Falls back in this order: template's bestChannel
  // → WhatsApp (if available) → Email.
  function chooseChannel(template: QuickReplyTemplate): ContactChannel {
    if (enquiry.preferred_contact.includes(template.bestChannel)) {
      return template.bestChannel;
    }
    if (enquiry.preferred_contact.includes('WHATSAPP') && enquiry.phone) {
      return 'WHATSAPP';
    }
    return 'EMAIL';
  }

  function buildHref(template: QuickReplyTemplate): string {
    const rendered = renderTemplate(template, ctx);
    const channel = chooseChannel(template);
    if (channel === 'WHATSAPP' && enquiry.phone) {
      const num = enquiry.phone.replace(/\D/g, '');
      return `https://wa.me/${num}${rendered ? `?text=${encodeURIComponent(rendered)}` : ''}`;
    }
    if (channel === 'CALL' && enquiry.phone) {
      return `tel:${enquiry.phone.replace(/\s+/g, '')}`;
    }
    if (channel === 'SMS' && enquiry.phone) {
      return `sms:${enquiry.phone.replace(/\s+/g, '')}${rendered ? `?body=${encodeURIComponent(rendered)}` : ''}`;
    }
    const subject = (template.emailSubject ?? '').replaceAll('{programme}', ctx.programme);
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (rendered) params.set('body', rendered);
    const qs = params.toString();
    return `mailto:${enquiry.email}${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="ti-section">
      <div className="ti-section-title">
        Quick replies
        <span className="ti-section-hint">· click to open with the message pre-filled</span>
      </div>
      <div className="ti-templates">
        {QUICK_REPLY_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="ti-template"
            onClick={() => onPick(buildHref(t))}
            disabled={disabled}
          >
            <div className="ti-template-title">{t.label}</div>
            <div className="ti-template-preview">{t.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// Notes editor — 800ms debounced auto-save
// =========================================================

function NotesEditor({
  initialNotes,
  onSave,
  pending,
}: {
  initialNotes: string;
  onSave: (notes: string) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(initialNotes);
  // Binary "just saved" flag that flashes for ~3s after each save.
  // Avoids storing a timestamp + re-deriving age in render (React 19
  // purity rule trips on Date.now() during render).
  const [recentlySaved, setRecentlySaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraftRef = useRef(initialNotes);

  // Cleanup any pending debounce or flash timer when the component
  // unmounts (the parent uses key=enquiry_id so this fires on switch).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value === lastSavedDraftRef.current) return;
      lastSavedDraftRef.current = value;
      onSave(value);
      setRecentlySaved(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setRecentlySaved(false), 3000);
    }, 800);
  }

  return (
    <div className="ti-section">
      <div className="ti-section-title">
        Your notes
        <span className="ti-section-hint">· private, auto-saves</span>
      </div>
      <div className="ti-notes">
        <textarea
          className="ti-notes-textarea"
          rows={3}
          placeholder="Notes only you and admin can see — call outcomes, follow-up dates, preferences…"
          value={draft}
          onChange={(ev) => handleChange(ev.target.value)}
          disabled={pending}
        />
        {recentlySaved && (
          <div className="ti-notes-status">
            <Icon name="check" className="ti-notes-status-icon" />
            Saved · just now
          </div>
        )}
      </div>
    </div>
  );
}
