// mynclex/lib/bank/wrappers/trend/trends-list-client.tsx
//
// Client list + filter bar for the Trend datasets list (shared by the
// admin and tutor pages). Same model as the cases list: tiny volume →
// client-side, instant filtering over a precomputed searchText blob
// (title + scenario + the dataset rows/timepoints).
//
// Filters: content search · Status · Kind · "Needs attention" (a
// published dataset whose attached questions are all draft, so it
// delivers nothing — mirrors the trend publish gate).

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { QuestionPills } from '@/lib/bank/wrappers/question-pills';
import { HoverPeek } from '@/lib/bank/hover-peek';
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
}: {
  rows:       TrendListRow[];
  authorship: Record<string, Authorship>;
  surface:    'admin' | 'tutor';
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

  const active = Boolean(q || status || kind || attn);
  const basePath = surface === 'tutor' ? '/tutor/bank/trends' : '/admin/bank/trends';
  const entityType = surface === 'tutor' ? 'tutor_trend_dataset' : 'trend_dataset';

  function clearAll() { setQ(''); setStatus(''); setKind(''); setAttn(false); }

  return (
    <>
      <div className="bank-filters">
        <div className="bank-filter-grid">
          <div className="bank-filter-group bank-filter-search">
            <label className="bank-filter-label" htmlFor="tf-q">Search</label>
            <input
              id="tf-q"
              type="text"
              className="bank-filter-input"
              placeholder="Search title, scenario, dataset…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className={`bank-filter-group${status ? ' is-set' : ''}`}>
            <label className="bank-filter-label" htmlFor="tf-status">Status</label>
            <select id="tf-status" className="bank-filter-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className={`bank-filter-group${kind ? ' is-set' : ''}`}>
            <label className="bank-filter-label" htmlFor="tf-kind">Kind</label>
            <select id="tf-kind" className="bank-filter-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All</option>
              {kindOptions.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>

          <div className={`bank-filter-group${attn ? ' is-set' : ''}`}>
            <label className="bank-filter-label">Health</label>
            <label className="bank-attn-check" title="Published, but no attached question is published — delivers nothing">
              <input type="checkbox" checked={attn} onChange={(e) => setAttn(e.target.checked)} />
              <span>Needs attention</span>
            </label>
          </div>
        </div>

        <div className="bank-filter-active">
          <span className="bank-filter-count">{filtered.length} of {rows.length}</span>
          {active && (
            <button type="button" className="bank-filter-reset" onClick={clearAll}>Clear</button>
          )}
        </div>
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
        <table className="auth-list-table">
          <thead>
            <tr>
              <th>Trend ID</th>
              <th>Title</th>
              <th>Kind</th>
              <th>Attached</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Authors</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.trend_id}>
                <td className="auth-list-item-id"><code>{t.trend_id}</code></td>
                <td>
                  <HoverPeek panel={
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
                <td>{t.kindLabel}</td>
                <td>
                  {t.total}
                  <QuestionPills total={t.total} published={t.published} />
                </td>
                <td>
                  {t.is_published
                    ? <span className="auth-cs-tag ok">Published</span>
                    : <span className="auth-cs-tag muted">Draft</span>}
                </td>
                <td>{new Date(t.updated_at).toLocaleDateString()}</td>
                <td>
                  <AuthorshipCell
                    authorship={authorship[t.trend_id]}
                    realm={surface}
                    entityType={entityType}
                    entityId={t.trend_id}
                    title={t.title}
                  />
                </td>
                <td className="auth-list-row-actions">
                  <Link href={`${basePath}/${t.trend_id}`} className="auth-cs-btn tiny">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
