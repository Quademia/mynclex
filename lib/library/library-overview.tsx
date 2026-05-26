// mynclex/lib/library/library-overview.tsx
//
// Library home dashboard (slice 11.4 follow-on P2). Mounted at
// `/tutor/library` when no folder / shelf / view scope is active.
// Replaces the generic <EmptyState> hero that used to render when
// nothing was selected — now a tutor visiting the library lands on
// a real overview of their content instead of "your library is
// empty."
//
// Four sections, top-to-bottom:
//   1. Stat cards — 5 big numbers: Total notes · Folders · Shelves
//      · Drafts · Not in any programme unit.
//   2. Recent activity — last 5 edited notes, clickable straight
//      into the editor.
//   3. Pillar coverage — horizontal bar per NCLEX pillar showing
//      relative note count (surfaces coverage gaps).
//   4. Quick links — chip row routing to the three system views
//      plus All folders / All shelves.

'use client';

import Link from 'next/link';
import {
  NCLEX_PILLARS,
  type LibraryOverviewStats,
  type NclexPillar,
} from './types';
import { formatRelative, pillarShortName } from './format';

interface LibraryOverviewProps {
  stats: LibraryOverviewStats;
}

export function LibraryOverview({ stats }: LibraryOverviewProps) {
  // Pillar bar scale — the longest bar fills the row; everything
  // else is proportional. Zero-count pillars get a minimum visible
  // sliver so the gap is visible but the row isn't empty.
  const maxPillarCount = Math.max(
    1,
    ...Object.values(stats.pillar_counts),
  );

  return (
    <div className="lib-overview">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <span className="b">Library</span>
          </div>
          <h1 className="lib-pane-title">Overview</h1>
          <p className="lib-pane-sub">
            Where your library stands today — counts, recent activity,
            and where your coverage is balanced.
          </p>
        </div>
      </header>

      <section className="lib-stat-cards" aria-label="Library counts">
        <StatCard label="Total notes" value={stats.total_notes} />
        <StatCard label="Folders" value={stats.folders} />
        <StatCard label="Shelves" value={stats.shelves} />
        <StatCard
          label="Drafts"
          value={stats.drafts}
          hint="Unpublished — students don't see these"
        />
        <StatCard
          label="Not in a programme"
          value={stats.used_nowhere}
          hint="Notes never attached to any unit"
        />
      </section>

      <div className="lib-overview-grid">
        <section className="lib-overview-section">
          <h2 className="lib-overview-section-title">Recent activity</h2>
          {stats.recent.length === 0 ? (
            <p className="lib-rail-muted">
              No notes yet — create your first one from the toolbar.
            </p>
          ) : (
            <ul className="lib-recent-list">
              {stats.recent.map((note) => (
                <li key={note.note_id}>
                  <Link
                    href={`/tutor/library/note/${note.note_id}`}
                    className="lib-recent-row"
                  >
                    <span className="lib-recent-title">{note.title}</span>
                    <span className="lib-recent-meta">
                      {note.folder_name ?? 'Root'} · edited{' '}
                      {formatRelative(note.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lib-overview-section">
          <h2 className="lib-overview-section-title">Pillar coverage</h2>
          <ul className="lib-pillar-bars" aria-label="Notes per NCLEX pillar">
            {NCLEX_PILLARS.map((p: NclexPillar) => {
              const count = stats.pillar_counts[p] ?? 0;
              const pct = (count / maxPillarCount) * 100;
              return (
                <li key={p} className="lib-pillar-bar-row">
                  <span className="lib-pillar-bar-label" title={p}>
                    {pillarShortName(p)}
                  </span>
                  <span className="lib-pillar-bar-track" aria-hidden="true">
                    <span
                      className="lib-pillar-bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="lib-pillar-bar-count">{count}</span>
                </li>
              );
            })}
          </ul>
          <p className="lib-rail-muted">
            Bars are scaled to your busiest pillar — useful for spotting
            coverage gaps in your own library.
          </p>
        </section>
      </div>

      <section className="lib-overview-section">
        <h2 className="lib-overview-section-title">Quick links</h2>
        <div className="lib-quick-links">
          <QuickLink href="/tutor/library?view=all-notes" label="All notes" />
          <QuickLink href="/tutor/library?view=drafts" label="Drafts" />
          <QuickLink
            href="/tutor/library?view=used-nowhere"
            label="Not in a programme"
          />
          <QuickLink href="/tutor/library?folder=all" label="All folders" />
          <QuickLink href="/tutor/library?shelf=all" label="All shelves" />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="lib-stat-card" title={hint}>
      <div className="lib-stat-value">{value}</div>
      <div className="lib-stat-label">{label}</div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="lib-quick-link">
      {label}
    </Link>
  );
}
