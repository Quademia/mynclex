// mynclex/lib/bank/wrappers/case-study/cases-list-client.tsx
//
// Client list + filter bar for the Case Studies list (shared by the
// admin and tutor pages — the reuse axis is admin/tutor, not wrapper
// type). Volume is tiny (single/double digits) so filtering is purely
// client-side and instant: the page hands over every row with a
// precomputed lowercased `searchText` blob (title + scenario + chart
// tabs), and this component filters in the browser.
//
// Filters: content search · Status · Difficulty · "Needs attention"
// (published but not deliverable — fewer than 6 child questions are
// published, so it reaches no students; mirrors the publish gate).

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { QuestionPills } from '@/lib/bank/wrappers/question-pills';
import { HoverPeek } from '@/lib/bank/hover-peek';
import { AuthorshipCell } from '@/lib/audit/authorship-line';
import type { Authorship } from '@/lib/audit/authorship';

export interface CaseListRow {
  case_id:            string;
  title:              string;
  scenario:           string | null;  // for the hover peek
  tabTitles:          string[];       // chart-tab names, for the peek
  is_published:       boolean;
  is_builder_visible: boolean;
  is_free_sample:     boolean;
  difficulty:         string | null;
  updated_at:         string;
  total:              number;   // attached question count
  published:          number;   // published question count
  searchText:         string;   // lowercased: title + scenario + chart text
}

// The delivery rule: a case reaches students only when it is published
// AND builder-visible AND all 6 child questions are published. So a
// published case that is hidden from the builder, or has fewer than 6
// published children, is "live but reaches nobody".
const needsAttention = (r: CaseListRow) =>
  r.is_published && (r.published < 6 || !r.is_builder_visible);

export function CasesListClient({
  rows,
  authorship,
  surface,
}: {
  rows:       CaseListRow[];
  authorship: Record<string, Authorship>;
  surface:    'admin' | 'tutor';
}) {
  const [q, setQ]                 = useState('');
  const [status, setStatus]       = useState('');
  const [difficulty, setDiff]     = useState('');
  const [attn, setAttn]           = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.searchText.includes(term)) return false;
      if (status === 'published' && !r.is_published) return false;
      if (status === 'draft' && r.is_published) return false;
      if (difficulty && r.difficulty !== difficulty) return false;
      if (attn && !needsAttention(r)) return false;
      return true;
    });
  }, [rows, q, status, difficulty, attn]);

  const active = Boolean(q || status || difficulty || attn);
  const basePath = surface === 'tutor' ? '/tutor/bank/cases' : '/admin/bank/cases';
  const entityType = surface === 'tutor' ? 'tutor_case_study' : 'case_study';

  function clearAll() { setQ(''); setStatus(''); setDiff(''); setAttn(false); }

  return (
    <>
      <div className="bank-filters">
        <div className="bank-filter-grid">
          <div className="bank-filter-group bank-filter-search">
            <label className="bank-filter-label" htmlFor="cf-q">Search</label>
            <input
              id="cf-q"
              type="text"
              className="bank-filter-input"
              placeholder="Search title, scenario, chart contents…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className={`bank-filter-group${status ? ' is-set' : ''}`}>
            <label className="bank-filter-label" htmlFor="cf-status">Status</label>
            <select id="cf-status" className="bank-filter-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className={`bank-filter-group${difficulty ? ' is-set' : ''}`}>
            <label className="bank-filter-label" htmlFor="cf-diff">Difficulty</label>
            <select id="cf-diff" className="bank-filter-input" value={difficulty} onChange={(e) => setDiff(e.target.value)}>
              <option value="">All</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          <div className={`bank-filter-group${attn ? ' is-set' : ''}`}>
            <label className="bank-filter-label">Health</label>
            <label className="bank-attn-check" title="Published, but reaches no students — fewer than 6 questions published, or hidden from the builder">
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
          <h3>No case studies match these filters</h3>
          <p>
            <button type="button" className="auth-link-btn" onClick={clearAll}>Clear filters</button>
            {' '}to see everything.
          </p>
        </div>
      ) : (
        <table className="auth-list-table">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Title</th>
              <th>Slots</th>
              <th>Status</th>
              <th>Difficulty</th>
              <th>Updated</th>
              <th>Authors</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.case_id}>
                <td className="auth-list-item-id"><code>{c.case_id}</code></td>
                <td>
                  <HoverPeek panel={
                    <div className="hover-peek">
                      <div className="hover-peek-title">{c.title}</div>
                      {c.scenario
                        ? <p className="hover-peek-body">{c.scenario}</p>
                        : <p className="hover-peek-empty">No scenario yet.</p>}
                      {c.tabTitles.length > 0 && (
                        <div className="hover-peek-chips">
                          {c.tabTitles.map((t, i) => (
                            <span key={i} className="hover-peek-chip">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  }>
                    {c.title}
                  </HoverPeek>
                </td>
                <td>
                  {c.total} of 6
                  <QuestionPills total={c.total} published={c.published} />
                </td>
                <td>
                  {c.is_published
                    ? <span className="auth-cs-tag ok">Published</span>
                    : <span className="auth-cs-tag muted">Draft</span>}
                  {c.is_free_sample && (
                    <span className="auth-cs-tag info" style={{ marginLeft: 6 }}>Free sample</span>
                  )}
                </td>
                <td>{c.difficulty ?? '—'}</td>
                <td>{new Date(c.updated_at).toLocaleDateString()}</td>
                <td>
                  <AuthorshipCell
                    authorship={authorship[c.case_id]}
                    realm={surface}
                    entityType={entityType}
                    entityId={c.case_id}
                    title={c.title}
                  />
                </td>
                <td className="auth-list-row-actions">
                  <Link href={`${basePath}/${c.case_id}`} className="auth-cs-btn tiny">
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
