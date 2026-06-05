// mynclex/lib/bank/bank-band.tsx
//
// The Question Bank list's overview / health band (2026-06 Claude Design
// "Bank surfaces" redesign — the Hybrid). Replaces the old text-chip
// BankCounts strip.
//
// A wide composition card (a 4-segment bar: Standalone · Case · Trend ·
// Note, with a legend) + three clickable stat cards — Published · Drafts ·
// Free samples — that double as one-tap filters. The cards drive the same
// server-side URL params as the filter bar (?status= / ?free_sample=), so
// clicking a card navigates and the server re-queries (no client filtering).
//
// Counts are WHOLE-BANK (not the filtered view) — they describe the
// population the cards filter into; the "Showing X of Y" line carries the
// filtered count. Styles: styles/bank-list.css (`bl-*`).

'use client';

import { useRouter } from 'next/navigation';
import { serializeBankFilters, type BankFilterValues } from '@/lib/bank/bank-list-query';

export interface BankBandCounts {
  total:       number;
  composition: { standalone: number; case: number; trend: number; note: number };
  published:   number;
  drafts:      number;
  free:        number;
}

export function BankBand({
  counts,
  filters,
  baseUrl,
}: {
  counts:  BankBandCounts;
  filters: BankFilterValues;
  baseUrl: string;
}) {
  const router = useRouter();
  const { total, composition, published, drafts, free } = counts;

  function go(next: BankFilterValues) {
    const qs = serializeBankFilters(next);
    router.replace(qs ? `${baseUrl}?${qs}` : baseUrl, { scroll: false });
  }
  // Each card TOGGLES its filter — click again to clear it.
  const toggleStatus = (v: 'published' | 'draft') =>
    go({ ...filters, status: filters.status === v ? '' : v });
  const toggleFree = () =>
    go({ ...filters, freeSample: filters.freeSample === 'yes' ? '' : 'yes' });

  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div className="bl-band bl-band-bank">
      {/* Composition bar + legend */}
      <div className="bl-stat bl-comp">
        <span className="bl-stat-label">Composition · {total} questions</span>
        <div className="bl-comp-bar">
          <span className="bl-comp-seg standalone" style={{ width: `${pct(composition.standalone)}%` }} title={`Standalone: ${composition.standalone}`} />
          <span className="bl-comp-seg case"       style={{ width: `${pct(composition.case)}%` }}       title={`Case-linked: ${composition.case}`} />
          <span className="bl-comp-seg trend"      style={{ width: `${pct(composition.trend)}%` }}      title={`Trend-linked: ${composition.trend}`} />
          <span className="bl-comp-seg note"       style={{ width: `${pct(composition.note)}%` }}       title={`Note-born: ${composition.note}`} />
        </div>
        <div className="bl-comp-legend">
          <span className="bl-comp-leg"><span className="sw standalone" />Standalone <b>{composition.standalone}</b></span>
          <span className="bl-comp-leg"><span className="sw case" />Case <b>{composition.case}</b></span>
          <span className="bl-comp-leg"><span className="sw trend" />Trend <b>{composition.trend}</b></span>
          <span className="bl-comp-leg"><span className="sw note" />Note <b>{composition.note}</b></span>
        </div>
      </div>

      <button
        type="button"
        className={`bl-stat${filters.status === 'published' ? ' is-on' : ''}`}
        onClick={() => toggleStatus('published')}
      >
        <span className="bl-stat-label">Published</span>
        <span className="bl-stat-value">{published}<span className="sub">/ {total}</span></span>
        <span className="bl-stat-foot">Live in the bank — tap to filter</span>
      </button>

      <button
        type="button"
        className={`bl-stat warn${filters.status === 'draft' ? ' is-on' : ''}`}
        onClick={() => toggleStatus('draft')}
      >
        <span className="bl-stat-label"><span className="bl-stat-ico warn">▲</span>Drafts</span>
        <span className="bl-stat-value">{drafts}</span>
        <span className="bl-stat-foot">Not yet delivered — tap to filter</span>
      </button>

      <button
        type="button"
        className={`bl-stat${filters.freeSample === 'yes' ? ' is-on' : ''}`}
        onClick={toggleFree}
      >
        <span className="bl-stat-label">Free samples</span>
        <span className="bl-stat-value">{free}</span>
        <span className="bl-stat-foot">Shown to non-subscribers — tap to filter</span>
      </button>
    </div>
  );
}
