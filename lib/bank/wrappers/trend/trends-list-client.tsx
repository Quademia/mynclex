// mynclex/lib/bank/wrappers/trend/trends-list-client.tsx
//
// Trend datasets list (shared by the admin + tutor pages — the reuse axis
// is admin/tutor, not wrapper type). Volume is tiny (single/double digits)
// so filtering is purely client-side and instant over a precomputed
// lowercased `searchText` blob (title + scenario + dataset rows/timepoints).
//
// 2026-06 redesign (Claude Design "Bank surfaces"): an overview/health band
// on top (stat cards, "Reaches nobody" doubles as a filter), a compact
// single-row toolbar (search · Status seg · Kind · Needs-attention chip ·
// + New), and a re-skinned table that adds a HEALTH column + an attached
// mini-bar. Styles: styles/bank-list.css (`bl-*`).
//
// The shared list primitives (AttachedBar / HealthFlag / SearchIcon) live in
// lib/bank/list-ui.tsx — extracted there once the Case-studies list became
// the second consumer.

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { HoverPeek } from '@/lib/bank/hover-peek';
import { AttachedBar, HealthFlag, SearchIcon } from '@/lib/bank/list-ui';
import { AuthorshipCell } from '@/lib/audit/authorship-line';
import type { Authorship } from '@/lib/audit/authorship';

export interface TrendListRow {
  trend_id:     string;
  title:        string;
  scenario:     string | null;  // for the hover peek
  kind:         string;
  kindLabel:    string;
  is_published: boolean;
  updated_at:   string;
  total:        number;   // attached question count
  published:    number;   // published attached question count
  searchText:   string;   // lowercased: title + scenario + dataset text
}

// A published dataset with zero published questions delivers nothing.
const needsAttention = (r: TrendListRow) => r.is_published && r.published === 0;

export function TrendsListClient({
  rows,
  authorship,
  surface,
  newButton,
}: {
  rows:       TrendListRow[];
  authorship: Record<string, Authorship>;
  surface:    'admin' | 'tutor';
  /** "+ New trend dataset" launcher, rendered right-aligned in the toolbar. */
  newButton?: ReactNode;
}) {
  const [q, setQ]           = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind]     = useState('');
  const [attn, setAttn]     = useState(false);

  // Distinct kinds present, for the Kind dropdown.
  const kindOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.kind)) seen.set(r.kind, r.kindLabel);
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.searchText.includes(term)) return false;
      if (status === 'published' && !r.is_published) return false;
      if (status === 'draft' && r.is_published) return false;
      if (kind && r.kind !== kind) return false;
      if (attn && !needsAttention(r)) return false;
      return true;
    });
  }, [rows, q, status, kind, attn]);

  // Band stats are over ALL rows (the whole list), not the filtered view —
  // they describe the dataset population, and the cards double as filters.
  const total         = rows.length;
  const pubCount      = useMemo(() => rows.filter((r) => r.is_published).length, [rows]);
  const attnCount     = useMemo(() => rows.filter(needsAttention).length, [rows]);
  const totalAttached = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  const active = Boolean(q || status || kind || attn);
  const basePath = surface === 'tutor' ? '/tutor/bank/trends' : '/admin/bank/trends';
  const entityType = surface === 'tutor' ? 'tutor_trend_dataset' : 'trend_dataset';

  function clearAll() { setQ(''); setStatus(''); setKind(''); setAttn(false); }

  return (
    <>
      {/* ── Overview / health band ── */}
      <div className="bl-band">
        <div className="bl-stat">
          <span className="bl-stat-label">Datasets</span>
          <span className="bl-stat-value">{total}</span>
          <span className="bl-stat-foot">Time-series panels</span>
        </div>
        <div className="bl-stat">
          <span className="bl-stat-label">Published</span>
          <span className="bl-stat-value">{pubCount}<span className="sub">/ {total}</span></span>
          <span className="bl-stat-foot">Live datasets</span>
        </div>
        <button
          type="button"
          className={`bl-stat warn${attn ? ' is-on' : ''}`}
          onClick={() => setAttn((v) => !v)}
        >
          <span className="bl-stat-label"><span className="bl-stat-ico warn">▲</span>Reaches nobody</span>
          <span className="bl-stat-value">{attnCount}</span>
          <span className="bl-stat-foot">Published, no live question — tap to filter</span>
        </button>
        <div className="bl-stat">
          <span className="bl-stat-label">Total attached</span>
          <span className="bl-stat-value">{totalAttached}</span>
          <span className="bl-stat-foot">Questions across all datasets</span>
        </div>
      </div>

      {/* ── Compact toolbar ── */}
      <div className="bl-toolbar">
        <div className="bl-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search title, scenario, dataset…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search trend datasets"
          />
        </div>
        <div className="bl-seg" role="group" aria-label="Status">
          {['', 'published', 'draft'].map((s) => (
            <button key={s || 'all'} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s === '' ? 'All' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select className="bl-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="">All kinds</option>
          {kindOptions.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <button
          type="button"
          className={`bl-chip warn${attn ? ' on' : ''}`}
          onClick={() => setAttn((v) => !v)}
          title="Published, but no attached question is published — delivers nothing"
        >
          <span className="ico">▲</span>Needs attention<span className="n">{attnCount}</span>
        </button>
        <span className="bl-spacer" />
        {newButton}
      </div>

      <div className="bl-result">
        Showing <b>{filtered.length}</b> of {rows.length} datasets
        {active && (
          <button type="button" className="bl-result-clear" onClick={clearAll}>Clear</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="auth-list-empty">
          <h3>No trend datasets match these filters</h3>
          <p>
            <button type="button" className="auth-link-btn" onClick={clearAll}>Clear filters</button>
            {' '}to see everything.
          </p>
        </div>
      ) : (
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th className="bl-id">Trend ID</th>
                <th className="bl-col-title">Title</th>
                <th>Kind</th>
                <th>Attached</th>
                <th>Status</th>
                <th>Health</th>
                <th>Updated</th>
                <th>Authors</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const bad = needsAttention(t);
                return (
                  <tr key={t.trend_id}>
                    <td className="bl-id"><code>{t.trend_id}</code></td>
                    <td className="bl-col-title">
                      <HoverPeek className="bl-title" panel={
                        <div className="hover-peek">
                          <div className="hover-peek-title">{t.title}</div>
                          {t.scenario
                            ? <p className="hover-peek-body">{t.scenario}</p>
                            : <p className="hover-peek-empty">No scenario yet.</p>}
                          <div className="hover-peek-chips">
                            <span className="hover-peek-chip">{t.kindLabel}</span>
                          </div>
                        </div>
                      }>
                        {t.title}
                      </HoverPeek>
                    </td>
                    <td className="bl-cell-mid">{t.kindLabel}</td>
                    <td><AttachedBar total={t.total} published={t.published} /></td>
                    <td>
                      {t.is_published
                        ? <span className="bl-status pub">Published</span>
                        : <span className="bl-status draft">Draft</span>}
                    </td>
                    <td>
                      {bad
                        ? <HealthFlag state="warn" text="Reaches nobody" />
                        : t.is_published
                          ? <HealthFlag state="ok" />
                          : <HealthFlag state="ghost" />}
                    </td>
                    <td className="bl-cell-mid">{new Date(t.updated_at).toLocaleDateString()}</td>
                    <td>
                      <AuthorshipCell
                        authorship={authorship[t.trend_id]}
                        realm={surface}
                        entityType={entityType}
                        entityId={t.trend_id}
                        title={t.title}
                      />
                    </td>
                    <td className="bl-actions">
                      <Link href={`${basePath}/${t.trend_id}`} className="bl-open">Open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
