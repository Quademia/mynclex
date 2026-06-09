// mynclex/lib/bank/wrappers/case-study/cases-list-client.tsx
//
// Case Studies list (shared by the admin + tutor pages — the reuse axis is
// admin/tutor, not wrapper type). Volume is tiny (single/double digits) so
// filtering is purely client-side and instant over a precomputed lowercased
// `searchText` blob (title + scenario + chart tabs).
//
// 2026-06 redesign (Claude Design "Bank surfaces"): an overview/health band
// on top (stat cards, "Needs attention" doubles as a filter), a compact
// single-row toolbar (search · Status seg · Needs-attention chip · + New),
// and a re-skinned table that adds a HEALTH column, an attached "N of 6"
// mini-bar, chart-tab chips under the title, and an inline "Hidden" tag.
// Shares list primitives with the Trends list via lib/bank/list-ui.tsx.
// Styles: styles/bank-list.css (`bl-*`).
//
// Difficulty is deliberately NOT shown or filtered here: a case is a
// container of up to 6 questions that each carry their own difficulty, so a
// single difficulty on the wrapper is a weak signal. (The DB column stays —
// the wrapper editor owns it; the list just doesn't read it.)

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { HoverPeek } from '@/lib/bank/hover-peek';
import { AttachedBar, HealthFlag, SearchIcon } from '@/lib/bank/list-ui';
import { AuthorshipCell } from '@/lib/audit/authorship-line';
import type { Authorship } from '@/lib/audit/authorship';

export interface CaseListRow {
  case_id:            string;
  title:              string;
  scenario:           string | null;  // for the hover peek
  tabTitles:          string[];       // chart-tab names, for the chips + peek
  is_published:       boolean;
  is_builder_visible: boolean;
  is_free_sample:     boolean;
  updated_at:         string;
  total:              number;   // attached question count
  published:          number;   // published question count
  searchText:         string;   // lowercased: title + scenario + chart text
}

// The delivery rule: a case reaches students only when it is published AND
// builder-visible AND all 6 child questions are published. So a published
// case that is hidden from the builder, or has fewer than 6 published
// children, is "live but reaches nobody".
const needsAttention = (r: CaseListRow) =>
  r.is_published && (r.published < 6 || !r.is_builder_visible);

// Why a published case isn't actually delivering — most-blocking first.
function attentionReason(r: CaseListRow): string {
  if (!r.is_builder_visible) return 'Hidden from builder';
  if (r.published < 6) return `${r.published}/6 published`;
  return 'Reaches nobody';
}

export function CasesListClient({
  rows,
  authorship,
  surface,
  newButton,
}: {
  rows:       CaseListRow[];
  authorship: Record<string, Authorship>;
  surface:    'admin' | 'tutor';
  /** "+ New case study" form, rendered right-aligned in the toolbar. */
  newButton?: ReactNode;
}) {
  const [q, setQ]           = useState('');
  const [status, setStatus] = useState('');
  const [attn, setAttn]     = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.searchText.includes(term)) return false;
      if (status === 'published' && !r.is_published) return false;
      if (status === 'draft' && r.is_published) return false;
      if (attn && !needsAttention(r)) return false;
      return true;
    });
  }, [rows, q, status, attn]);

  // Band stats over ALL rows (the whole list), not the filtered view.
  const total      = rows.length;
  const liveCount  = useMemo(() => rows.filter((r) => r.is_published && !needsAttention(r)).length, [rows]);
  const attnCount  = useMemo(() => rows.filter(needsAttention).length, [rows]);
  const slotted    = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);

  const active = Boolean(q || status || attn);
  const basePath = surface === 'tutor' ? '/tutor/bank/cases' : '/admin/bank/cases';
  const entityType = surface === 'tutor' ? 'tutor_case_study' : 'case_study';

  // Display pagination — render PAGE_SIZE rows, reveal more on demand. Reset
  // to the first page when the filters change.
  const PAGE_SIZE = 50;
  const [shown, setShown] = useState(PAGE_SIZE);
  // Reset to the first page when the filter set changes (render-phase reset).
  const filterSig = `${q}|${status}|${attn}`;
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig);
  if (filterSig !== prevFilterSig) {
    setPrevFilterSig(filterSig);
    setShown(PAGE_SIZE);
  }
  const visible = filtered.slice(0, shown);

  function clearAll() { setQ(''); setStatus(''); setAttn(false); }

  return (
    <>
      {/* ── Overview / health band ── */}
      <div className="bl-band">
        <div className="bl-stat">
          <span className="bl-stat-label">Case studies</span>
          <span className="bl-stat-value">{total}</span>
          <span className="bl-stat-foot">Multi-question scenarios</span>
        </div>
        <div className="bl-stat">
          <span className="bl-stat-label">Fully live</span>
          <span className="bl-stat-value">{liveCount}<span className="sub">/ {total}</span></span>
          <span className="bl-stat-foot">Published &amp; reaching students</span>
        </div>
        <button
          type="button"
          className={`bl-stat warn${attn ? ' is-on' : ''}`}
          onClick={() => setAttn((v) => !v)}
        >
          <span className="bl-stat-label"><span className="bl-stat-ico warn">▲</span>Needs attention</span>
          <span className="bl-stat-value">{attnCount}</span>
          <span className="bl-stat-foot">Live but incomplete or hidden — tap to filter</span>
        </button>
        <div className="bl-stat">
          <span className="bl-stat-label">Questions slotted</span>
          <span className="bl-stat-value">{slotted}<span className="sub">/ {total * 6}</span></span>
          <span className="bl-stat-foot">Across all cases (max 6 each)</span>
        </div>
      </div>

      {/* ── Compact toolbar ── */}
      <div className="bl-toolbar">
        <div className="bl-search">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search title, scenario, chart contents…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search case studies"
          />
        </div>
        <div className="bl-seg" role="group" aria-label="Status">
          {['', 'published', 'draft'].map((s) => (
            <button key={s || 'all'} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s === '' ? 'All' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`bl-chip warn${attn ? ' on' : ''}`}
          onClick={() => setAttn((v) => !v)}
          title="Published, but reaches no students — fewer than 6 questions published, or hidden from the builder"
        >
          <span className="ico">▲</span>Needs attention<span className="n">{attnCount}</span>
        </button>
        <span className="bl-spacer" />
        {newButton}
      </div>

      <div className="bl-result">
        Showing <b>{Math.min(shown, filtered.length)}</b> of {filtered.length} case studies
        {filtered.length !== rows.length && <span> · {rows.length} total</span>}
        {active && (
          <button type="button" className="bl-result-clear" onClick={clearAll}>Clear</button>
        )}
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
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th className="bl-id">Case ID</th>
                <th className="bl-col-title">Title</th>
                <th>Slots</th>
                <th>Status</th>
                <th>Health</th>
                <th>Updated</th>
                <th>Authors</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const bad = needsAttention(c);
                return (
                  <tr key={c.case_id}>
                    <td className="bl-id"><code>{c.case_id}</code></td>
                    <td className="bl-col-title">
                      <HoverPeek className="bl-title" panel={
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
                      {c.tabTitles.length > 0 && (
                        <div className="bl-tabchips">
                          {c.tabTitles.slice(0, 3).map((t, i) => (
                            <span key={i} className="bl-tabchip">{t}</span>
                          ))}
                          {c.tabTitles.length > 3 && (
                            <span className="bl-tabchip">+{c.tabTitles.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td><AttachedBar total={c.total} published={c.published} denom={6} /></td>
                    <td>
                      <span className="bl-status-row">
                        {c.is_published
                          ? <span className="bl-status pub">Published</span>
                          : <span className="bl-status draft">Draft</span>}
                        {!c.is_builder_visible && <span className="bl-status hidden">Hidden</span>}
                        {c.is_free_sample && <span className="bl-status free">Free</span>}
                      </span>
                    </td>
                    <td>
                      {bad
                        ? <HealthFlag state="warn" text={attentionReason(c)} />
                        : c.is_published
                          ? <HealthFlag state="ok" />
                          : <HealthFlag state="ghost" />}
                    </td>
                    <td className="bl-cell-mid">{new Date(c.updated_at).toLocaleDateString()}</td>
                    <td>
                      <AuthorshipCell
                        authorship={authorship[c.case_id]}
                        realm={surface}
                        entityType={entityType}
                        entityId={c.case_id}
                        title={c.title}
                      />
                    </td>
                    <td className="bl-actions">
                      <Link href={`${basePath}/${c.case_id}`} className="bl-open">Open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > shown && (
            <div className="bl-loadmore">
              <button type="button" className="bl-btn" onClick={() => setShown((s) => s + PAGE_SIZE)}>
                Show more <span className="bl-loadmore-n">{filtered.length - shown} more</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
