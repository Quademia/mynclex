// mynclex/lib/payments/tutor/tutor-payments-view.tsx
//
// The global tutor Payments ledger (/tutor/payments). Built from the CD
// "Tutor Payments v1.1" prototype: a summary band + always-visible
// filter toolbar (search · programme · channel · status · cohort ·
// date) + active chips + a month-grouped table (desktop) / cards
// (mobile), with a per-programme rollup strip when one programme is
// selected, and CSV export of the filtered rows.
//
// Received money only — the read helper already excludes bank /
// readiness purposes and INIT / FAILED attempts. Owed / upcoming money
// is NOT a row; it lives in the per-student history drawer (the 🕑 in
// the Purpose cell — added in Slice 2).
//
// All filtering is client-side over the loaded set (load-all for v1,
// like the enrolment roster), live-apply.

'use client';

import { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/strategies/format';
import { initials } from '@/lib/enrolments/format';
import { PaymentHistoryDrawer } from '@/lib/enrolments/payment-history-drawer';
import { toCsv, downloadCsv } from './csv';
import type { TutorPaymentRow, TutorCohortOption } from './types';

type ChannelFilter = 'all' | 'online' | 'offplatform';
type StatusFilter = 'all' | 'received' | 'refunded';
type DateFilter = 'all' | 'thismonth' | 'last3months';
const SELF_PACED = '__self_paced__';

function SearchIcon() {
  return (
    <svg
      className="tpay-search-ic"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function groupMajor(minor: number): string {
  return (minor / 100).toLocaleString('en-US');
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function shortProg(name: string): string {
  const w = name.split(/\s+/);
  return w.length <= 3 ? name : `${w.slice(0, 3).join(' ')}…`;
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isLast3Months(iso: string): boolean {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  return new Date(iso).getTime() >= cutoff.getTime();
}

type GroupItem =
  | { kind: 'month'; key: string; label: string; count: number }
  | { kind: 'row'; key: string; row: TutorPaymentRow };

type RollupData = {
  label: string;
  totalLabel: string;
  sub: string;
  onPct: number;
  offPct: number;
  empty: boolean;
};

// A fixed-scope rollup scorecard from a row subset (a programme's or a
// cohort's rows). Received money only; ignores the channel/status/date
// filters (the table is the filtered view, this is the scorecard).
function computeRollup(scoped: TutorPaymentRow[], label: string): RollupData {
  const recv = scoped.filter((r) => r.status === 'received');
  if (recv.length === 0) {
    return { label, totalLabel: 'No payments yet', sub: '', onPct: 0, offPct: 0, empty: true };
  }
  const total = recv.reduce((s, r) => s + r.amountMinor, 0);
  const onAmt = recv.filter((r) => r.channel === 'online').reduce((s, r) => s + r.amountMinor, 0);
  const onCnt = recv.filter((r) => r.channel === 'online').length;
  const offCnt = recv.filter((r) => r.channel === 'offplatform').length;
  const currency = recv[0]?.currency ?? 'GHS';
  const onPct = total > 0 ? Math.round((onAmt / total) * 100) : 0;
  return {
    label,
    totalLabel: `${formatMoney(currency, total)} received`,
    sub: `${recv.length} payment${recv.length === 1 ? '' : 's'} · Online ${onCnt} · Off-platform ${offCnt}`,
    onPct,
    offPct: 100 - onPct,
    empty: false,
  };
}

export function TutorPaymentsView({
  rows,
  cohorts,
}: {
  rows: TutorPaymentRow[];
  cohorts: TutorCohortOption[];
}) {
  const [search, setSearch] = useState('');
  const [prog, setProg] = useState('all');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [cohort, setCohort] = useState('all');
  const [dateRange, setDateRange] = useState<DateFilter>('all');
  // The payment whose history drawer is open (🕑 in the Purpose cell).
  const [historyRow, setHistoryRow] = useState<TutorPaymentRow | null>(null);

  // ── Programme + cohort filter options (from the loaded set) ──
  const progOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.programmeId)) seen.set(r.programmeId, r.programmeName);
    return [...seen.entries()].map(([value, label]) => ({ value, label, short: shortProg(label) }));
  }, [rows]);

  // The tutor's cohorts (incl. payment-less), scoped to the selected
  // programme; in "All programmes" mode each is prefixed with its
  // programme to disambiguate. "Self-paced" appears when self-paced
  // payments exist in the current scope.
  const cohortOptions = useMemo(() => {
    const scoped = prog !== 'all' ? cohorts.filter((c) => c.programmeId === prog) : cohorts;
    const opts = scoped.map((c) => ({
      value: c.cohortId,
      label: prog !== 'all' ? c.label : `${c.programmeName} — ${c.label}`,
    }));
    const hasSelfPaced = rows.some((r) => !r.cohortId && (prog === 'all' || r.programmeId === prog));
    if (hasSelfPaced) opts.push({ value: SELF_PACED, label: 'Self-paced' });
    return opts;
  }, [cohorts, rows, prog]);

  // Change programme, dropping a cohort selection that the new programme
  // scope no longer offers (avoids a stuck filter that yields no rows).
  const changeProg = (next: string) => {
    setProg(next);
    if (next === 'all') return;
    if (cohort !== 'all' && cohort !== SELF_PACED) {
      if (!cohorts.some((c) => c.cohortId === cohort && c.programmeId === next)) setCohort('all');
    } else if (cohort === SELF_PACED) {
      if (!rows.some((r) => !r.cohortId && r.programmeId === next)) setCohort('all');
    }
  };

  // ── Filtered set ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q)) return false;
      if (prog !== 'all' && r.programmeId !== prog) return false;
      if (channel !== 'all' && r.channel !== channel) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (cohort !== 'all' && (r.cohortId ?? SELF_PACED) !== cohort) return false;
      if (dateRange === 'thismonth' && !isThisMonth(r.dateIso)) return false;
      if (dateRange === 'last3months' && !isLast3Months(r.dateIso)) return false;
      return true;
    });
  }, [rows, search, prog, channel, status, cohort, dateRange]);

  // ── Summary band (always the WHOLE set, not the filtered view) ──
  const band = useMemo(() => {
    const recvGhs = rows.filter((r) => r.status === 'received' && r.currency === 'GHS');
    const recvUsd = rows.filter((r) => r.status === 'received' && r.currency === 'USD');
    const refGhs = rows.filter((r) => r.status === 'refunded' && r.currency === 'GHS').length;
    const refUsd = rows.filter((r) => r.status === 'refunded' && r.currency === 'USD').length;
    return {
      ghsTotal: groupMajor(recvGhs.reduce((s, r) => s + r.amountMinor, 0)),
      usdTotal: groupMajor(recvUsd.reduce((s, r) => s + r.amountMinor, 0)),
      ghsFoot: `${recvGhs.length} received${refGhs > 0 ? ` · ${refGhs} refunded` : ''} · GHS`,
      usdFoot: `${recvUsd.length} received${refUsd > 0 ? ` · ${refUsd} refunded` : ''} · USD`,
      online: rows.filter((r) => r.status === 'received' && r.channel === 'online').length,
      off: rows.filter((r) => r.status === 'received' && r.channel === 'offplatform').length,
    };
  }, [rows]);

  // ── Rollup scorecards (Programme + Cohort) ──
  // Programme shows when a programme is selected OR a cohort is (we derive
  // the cohort's parent programme). Cohort shows when a NAMED cohort is
  // selected (Self-paced has no cohort). Both present → side by side.
  const rollups = useMemo(() => {
    const namedCohort = cohort !== 'all' && cohort !== SELF_PACED ? cohort : null;

    let cohortRollup: RollupData | null = null;
    let parentProgrammeId: string | null = null;
    if (namedCohort) {
      // Parent programme + label from the cohort meta, so an EMPTY cohort
      // (no payment rows) still pairs with its programme and names itself.
      const meta = cohorts.find((c) => c.cohortId === namedCohort);
      parentProgrammeId = meta?.programmeId ?? null;
      const cohortRows = rows.filter((r) => r.cohortId === namedCohort);
      cohortRollup = computeRollup(cohortRows, meta?.label ?? cohortRows[0]?.cohortLabel ?? 'Cohort');
    }

    const programmeId = prog !== 'all' ? prog : parentProgrammeId;
    let programmeRollup: RollupData | null = null;
    if (programmeId) {
      const progRows = rows.filter((r) => r.programmeId === programmeId);
      const progName =
        progRows[0]?.programmeName ??
        cohorts.find((c) => c.programmeId === programmeId)?.programmeName ??
        'Programme';
      programmeRollup = computeRollup(progRows, progName);
    }

    return { programmeRollup, cohortRollup };
  }, [rows, prog, cohort, cohorts]);

  // ── Active filter chips ──
  const chips = useMemo(() => {
    const out: { label: string; clear: () => void }[] = [];
    if (search.trim()) out.push({ label: `“${search.trim()}”`, clear: () => setSearch('') });
    if (prog !== 'all') {
      const p = progOptions.find((o) => o.value === prog);
      out.push({ label: p ? p.short : 'Programme', clear: () => setProg('all') });
    }
    if (channel !== 'all')
      out.push({ label: channel === 'online' ? 'Online · Paystack' : 'Off-platform', clear: () => setChannel('all') });
    if (status !== 'all')
      out.push({ label: status === 'received' ? 'Received' : 'Refunded', clear: () => setStatus('all') });
    if (cohort !== 'all') {
      const label =
        cohort === SELF_PACED
          ? 'Self-paced'
          : (cohorts.find((c) => c.cohortId === cohort)?.label ?? 'Cohort');
      out.push({ label, clear: () => setCohort('all') });
    }
    if (dateRange !== 'all')
      out.push({ label: dateRange === 'thismonth' ? 'This month' : 'Last 3 months', clear: () => setDateRange('all') });
    return out;
  }, [search, prog, channel, status, cohort, dateRange, progOptions, cohorts]);

  // ── Month-grouped list (newest first) ──
  const grouped = useMemo<GroupItem[]>(() => {
    const buckets = new Map<string, { label: string; sort: string; rows: TutorPaymentRow[] }>();
    for (const r of filtered) {
      const d = new Date(r.dateIso);
      const sort = r.dateIso.slice(0, 7);
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      const b = buckets.get(label) ?? { label, sort, rows: [] };
      b.rows.push(r);
      buckets.set(label, b);
    }
    const out: GroupItem[] = [];
    for (const b of [...buckets.values()].sort((a, z) => z.sort.localeCompare(a.sort))) {
      out.push({ kind: 'month', key: `m-${b.label}`, label: b.label, count: b.rows.length });
      for (const r of b.rows) out.push({ kind: 'row', key: r.paymentId, row: r });
    }
    return out;
  }, [filtered]);

  const clearAll = () => {
    setSearch('');
    setProg('all');
    setChannel('all');
    setStatus('all');
    setCohort('all');
    setDateRange('all');
  };

  const onExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`mynclex-payments-${stamp}.csv`, toCsv(filtered));
  };

  const isEmpty = filtered.length === 0;
  const showPills = progOptions.length <= 3;
  const selectedCohortLabel =
    cohort !== 'all' && cohort !== SELF_PACED
      ? (cohorts.find((c) => c.cohortId === cohort)?.label ?? null)
      : null;

  return (
    <div className="tpay-page">
      {/* Header */}
      <div className="tpay-head">
        <div>
          <div className="tpay-eyebrow">
            <span className="tpay-eyebrow-chip">
              <span className="dot" /> Tutor
            </span>
            Programme Payments
          </div>
          <h1 className="tpay-title">Programme Payments</h1>
          <p className="tpay-sub">
            Received payments from students across your programmes. Excludes platform
            subscriptions and readiness packs.
          </p>
        </div>
        <button type="button" className="tpay-export" onClick={onExport} disabled={isEmpty}>
          ↓ Export CSV
        </button>
      </div>

      {/* Summary band */}
      <div className="tpay-band">
        <div className="tpay-stat">
          <div className="tpay-stat-head">
            <span className="tpay-stat-ic is-ghs">₵</span>GHS Received
          </div>
          <div className="tpay-stat-num">GHS {band.ghsTotal}</div>
          <div className="tpay-stat-foot">{band.ghsFoot}</div>
        </div>
        <div className="tpay-stat">
          <div className="tpay-stat-head">
            <span className="tpay-stat-ic is-usd">$</span>USD Received
          </div>
          <div className="tpay-stat-num">$ {band.usdTotal}</div>
          <div className="tpay-stat-foot">{band.usdFoot}</div>
        </div>
        <div className="tpay-stat">
          <div className="tpay-stat-head">
            <span className="tpay-stat-ic is-online">↑</span>Online · Paystack
          </div>
          <div className="tpay-stat-num">{band.online}</div>
          <div className="tpay-stat-foot">collected into platform</div>
        </div>
        <div className="tpay-stat">
          <div className="tpay-stat-head">
            <span className="tpay-stat-ic is-off">✎</span>Off-platform
          </div>
          <div className="tpay-stat-num">{band.off}</div>
          <div className="tpay-stat-foot">tutor-recorded cash / transfer</div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="tpay-toolbar">
        <div className="tpay-search">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
        </div>

        {showPills ? (
          <div className="tpay-seg">
            <button
              type="button"
              className={`tpay-seg-btn${prog === 'all' ? ' is-on' : ''}`}
              onClick={() => changeProg('all')}
            >
              All
            </button>
            {progOptions.map((o) => (
              <button
                type="button"
                key={o.value}
                className={`tpay-seg-btn${prog === o.value ? ' is-on' : ''}`}
                onClick={() => changeProg(o.value)}
                title={o.label}
              >
                {o.short}
              </button>
            ))}
          </div>
        ) : (
          <select className="tpay-select" value={prog} onChange={(e) => changeProg(e.target.value)}>
            <option value="all">All programmes</option>
            {progOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        <div className="tpay-seg">
          <button
            type="button"
            className={`tpay-seg-btn${channel === 'all' ? ' is-on' : ''}`}
            onClick={() => setChannel('all')}
          >
            All channels
          </button>
          <button
            type="button"
            className={`tpay-seg-btn${channel === 'online' ? ' is-on' : ''}`}
            onClick={() => setChannel('online')}
          >
            ↑ Online
          </button>
          <button
            type="button"
            className={`tpay-seg-btn${channel === 'offplatform' ? ' is-on' : ''}`}
            onClick={() => setChannel('offplatform')}
          >
            ✎ Off-platform
          </button>
        </div>

        <div className="tpay-seg">
          <button
            type="button"
            className={`tpay-seg-btn${status === 'all' ? ' is-on' : ''}`}
            onClick={() => setStatus('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`tpay-seg-btn${status === 'received' ? ' is-on' : ''}`}
            onClick={() => setStatus('received')}
          >
            Received
          </button>
          <button
            type="button"
            className={`tpay-seg-btn${status === 'refunded' ? ' is-on' : ''}`}
            onClick={() => setStatus('refunded')}
          >
            Refunded
          </button>
        </div>

        {cohortOptions.length > 0 && (
          <select className="tpay-select" value={cohort} onChange={(e) => setCohort(e.target.value)}>
            <option value="all">All cohorts</option>
            {cohortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        <select
          className="tpay-select"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateFilter)}
        >
          <option value="all">All time</option>
          <option value="thismonth">This month</option>
          <option value="last3months">Last 3 months</option>
        </select>
      </div>

      {/* Active chips */}
      {chips.length > 0 && (
        <div className="tpay-chips">
          <span className="tpay-chips-label">Active:</span>
          {chips.map((c, i) => (
            <span className="tpay-chip" key={i}>
              {c.label}
              <button type="button" className="tpay-chip-x" onClick={c.clear} aria-label="Remove filter">
                ×
              </button>
            </span>
          ))}
          <button type="button" className="tpay-clear" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      {/* Result count */}
      <div className="tpay-count">
        Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong> payments
      </div>

      {/* Rollup scorecards (programme left, cohort right when paired) */}
      {(rollups.programmeRollup || rollups.cohortRollup) && (
        <div
          className={`tpay-rollups${
            rollups.programmeRollup && rollups.cohortRollup ? ' is-pair' : ''
          }`}
        >
          {rollups.programmeRollup && <RollupCard data={rollups.programmeRollup} kind="programme" />}
          {rollups.cohortRollup && <RollupCard data={rollups.cohortRollup} kind="cohort" />}
        </div>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <div className="tpay-empty">
          <div className="tpay-empty-ic">₵</div>
          <div className="tpay-empty-title">
            {selectedCohortLabel
              ? `No payments for ${selectedCohortLabel} yet`
              : 'No payments match these filters'}
          </div>
          <div className="tpay-empty-sub">
            {selectedCohortLabel
              ? 'Payments from this cohort will appear here once they come in.'
              : cohort === SELF_PACED
                ? 'Self-paced payments will appear here once they come in.'
                : rows.length === 0
                  ? 'Student payments to your programmes will appear here.'
                  : 'Try broadening your search or clearing filters.'}
          </div>
          {chips.length > 0 && (
            <button type="button" className="tpay-empty-btn" onClick={clearAll}>
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="tpay-table-wrap">
            <table className="tpay-table">
              <thead>
                <tr>
                  <th>Payer</th>
                  <th>Programme · Cohort</th>
                  <th>Purpose</th>
                  <th>Channel</th>
                  <th className="ta-right">Amount</th>
                  <th>Status</th>
                  <th className="ta-right">Date paid</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((item) =>
                  item.kind === 'month' ? (
                    <tr className="tpay-month-row" key={item.key}>
                      <td colSpan={7}>
                        <span className="tpay-month-label">{item.label}</span>
                        <span className="tpay-month-count">{item.count}</span>
                      </td>
                    </tr>
                  ) : (
                    <TableRow row={item.row} key={item.key} onOpenHistory={setHistoryRow} />
                  ),
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="tpay-cards">
            {grouped.map((item) =>
              item.kind === 'month' ? (
                <div className="tpay-month-head" key={item.key}>
                  <span className="tpay-month-label">{item.label}</span>
                  <span className="tpay-month-count">{item.count}</span>
                </div>
              ) : (
                <MobileCard row={item.row} key={item.key} onOpenHistory={setHistoryRow} />
              ),
            )}
          </div>
        </>
      )}

      {historyRow?.enrolmentId && (
        <PaymentHistoryDrawer
          enrolmentId={historyRow.enrolmentId}
          name={historyRow.name}
          email={historyRow.email}
          onClose={() => setHistoryRow(null)}
        />
      )}
    </div>
  );
}

// ── Rollup scorecard ──

function RollupCard({ data, kind }: { data: RollupData; kind: 'programme' | 'cohort' }) {
  return (
    <div className="tpay-rollup">
      <div className="tpay-rollup-label">
        <span className={`tpay-rollup-kind${kind === 'cohort' ? ' is-cohort' : ''}`}>
          {kind === 'cohort' ? 'Cohort' : 'Programme'}
        </span>
        <span className="tpay-rollup-name">{data.label}</span>
      </div>
      <div className="tpay-rollup-top">
        <span className={`tpay-rollup-total${data.empty ? ' is-empty' : ''}`}>
          {data.totalLabel}
        </span>
        {data.sub && <span className="tpay-rollup-sub">{data.sub}</span>}
      </div>
      {!data.empty && (
        <>
          <div className="tpay-rollup-bar">
            <span style={{ width: `${data.onPct}%` }} className="is-online" />
            <span style={{ width: `${data.offPct}%` }} className="is-off" />
          </div>
          <div className="tpay-rollup-legend">
            <span>
              <span className="dot is-online" />
              Online · Paystack {data.onPct}%
            </span>
            <span>
              <span className="dot is-off" />
              Off-platform {data.offPct}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Shared cell fragments ──

function CohortTag({ row }: { row: TutorPaymentRow }) {
  return (
    <span className={`tpay-cohort-tag${row.cohortLabel ? '' : ' is-selfpaced'}`}>
      {row.cohortLabel ?? 'Self-paced'}
    </span>
  );
}

function PurposeCell({
  row,
  onOpenHistory,
}: {
  row: TutorPaymentRow;
  onOpenHistory: (row: TutorPaymentRow) => void;
}) {
  return (
    <>
      <span className="tpay-purpose">
        {row.purpose === 'installment' ? 'Installment' : 'Initial'}
      </span>
      {row.purpose === 'installment' && row.installmentIndex && (
        <span className="tpay-inst">
          {row.installmentIndex}
          {row.installmentTotal ? ` of ${row.installmentTotal}` : ''}
        </span>
      )}
      {row.hasHistory && (
        <button
          type="button"
          className="tpay-clock"
          title="View payment history"
          aria-label="View payment history"
          onClick={() => onOpenHistory(row)}
        >
          🕑
        </button>
      )}
    </>
  );
}

function ChannelPill({ row }: { row: TutorPaymentRow }) {
  return (
    <span className={`tpay-pill ${row.channel === 'online' ? 'is-online' : 'is-off'}`}>
      {row.channel === 'online' ? 'Online · Paystack' : 'Off-platform'}
    </span>
  );
}

function StatusPill({ row }: { row: TutorPaymentRow }) {
  return (
    <span className={`tpay-status ${row.status === 'received' ? 'is-received' : 'is-refunded'}`}>
      <span className="pip">●</span> {row.status === 'received' ? 'Received' : 'Refunded'}
    </span>
  );
}

function TableRow({
  row,
  onOpenHistory,
}: {
  row: TutorPaymentRow;
  onOpenHistory: (row: TutorPaymentRow) => void;
}) {
  const refunded = row.status === 'refunded';
  return (
    <tr className={refunded ? 'is-refunded' : undefined}>
      <td>
        <div className="tpay-payer">
          <span className={`tpay-avatar${refunded ? ' is-refunded' : ''}`}>{initials(row.name)}</span>
          <div className="tpay-payer-id">
            <div className="tpay-name">{row.name}</div>
            <div className="tpay-email">{row.email}</div>
          </div>
        </div>
      </td>
      <td>
        <div className="tpay-prog">{row.programmeName}</div>
        <div className="tpay-prog-cohort">
          <CohortTag row={row} />
        </div>
      </td>
      <td>
        <div className="tpay-purpose-cell">
          <PurposeCell row={row} onOpenHistory={onOpenHistory} />
        </div>
      </td>
      <td>
        <ChannelPill row={row} />
      </td>
      <td className="ta-right">
        <span className={`tpay-amount${refunded ? ' is-refunded' : ''}`}>
          {formatMoney(row.currency, row.amountMinor)}
        </span>
      </td>
      <td>
        <StatusPill row={row} />
      </td>
      <td className="ta-right">
        <span className="tpay-date">{fmtDay(row.dateIso)}</span>
      </td>
    </tr>
  );
}

function MobileCard({
  row,
  onOpenHistory,
}: {
  row: TutorPaymentRow;
  onOpenHistory: (row: TutorPaymentRow) => void;
}) {
  const refunded = row.status === 'refunded';
  return (
    <div className={`tpay-card${refunded ? ' is-refunded' : ''}`}>
      <div className="tpay-card-top">
        <span className={`tpay-avatar${refunded ? ' is-refunded' : ''}`}>{initials(row.name)}</span>
        <div className="tpay-payer-id">
          <div className="tpay-name">{row.name}</div>
          <div className="tpay-email">{row.email}</div>
        </div>
        <div className="tpay-card-amt">
          <span className={`tpay-amount${refunded ? ' is-refunded' : ''}`}>
            {formatMoney(row.currency, row.amountMinor)}
          </span>
          <StatusPill row={row} />
        </div>
      </div>
      <div className="tpay-card-div" />
      <div className="tpay-prog">{row.programmeName}</div>
      <div className="tpay-card-meta">
        <CohortTag row={row} />
        <span className="sep">·</span>
        <PurposeCell row={row} onOpenHistory={onOpenHistory} />
      </div>
      <div className="tpay-card-foot">
        <ChannelPill row={row} />
        <span className="tpay-date">{fmtDay(row.dateIso)}</span>
      </div>
    </div>
  );
}
