'use client';

// mynclex/lib/library/home/home-shell.tsx
//
// Tutor library home — chrome-only slice (11.1 part 2).
// Renders the page frame: title + toolbar + (sidebar + main pane).
// The 5-lens sidebar is structural (Views / Folders / Shelves /
// Pillars / Tags), powered by static data this slice — folder /
// shelf / note CRUD lands in slice 11.2.
//
// State held here:
//   • `railed`        — whole sidebar collapsed to a 48 px icon strip.
//                        Persisted in localStorage so the tutor's
//                        choice survives reloads.
//   • `openSections`  — per-lens-section open/closed (chevron toggle).
//                        Default-open everywhere; closed state also
//                        persists.
//
// The schema migration (slice 11.1 part 1) is committed but not yet
// applied to mynclex-dev — no data calls happen on this surface, so
// the page renders cleanly without it.

import { useEffect, useState } from 'react';

const LS_RAILED = 'mynclex.library.home.railed';
const LS_SECTIONS = 'mynclex.library.home.sections';

type LensKey = 'views' | 'folders' | 'shelves' | 'pillars' | 'tags';

const ALL_SECTIONS: LensKey[] = [
  'views',
  'folders',
  'shelves',
  'pillars',
  'tags',
];

// Section-level icon used in the railed (collapsed) sidebar.
// Single Unicode glyphs are fine for a v1 chrome — we can swap in
// real SVG icons once the lens entries gain richer affordances.
const SECTION_RAIL_GLYPH: Record<LensKey, string> = {
  views: '☰',
  folders: '📁',
  shelves: '📚',
  pillars: '◆',
  tags: '#',
};

const SECTION_LABEL: Record<LensKey, string> = {
  views: 'Views',
  folders: 'Folders',
  shelves: 'Shelves',
  pillars: 'Pillars',
  tags: 'Tags',
};

// The 8 NCLEX-RN Client Needs sub-categories, full NCSBN names. Must
// match the `nclex_pillar` domain in db/migrations/20260616120000_*.sql.
const PILLAR_NAMES: string[] = [
  'Management of Care',
  'Safety and Infection Control',
  'Health Promotion and Maintenance',
  'Psychosocial Integrity',
  'Basic Care and Comfort',
  'Pharmacological and Parenteral Therapies',
  'Reduction of Risk Potential',
  'Physiological Adaptation',
];

export function LibraryHomeShell() {
  // Default to expanded + all sections open. localStorage rehydration
  // happens in a useEffect (so first paint is consistent across
  // server + client; no hydration mismatch).
  const [railed, setRailed] = useState(false);
  const [closedSections, setClosedSections] = useState<Set<LensKey>>(
    () => new Set(),
  );

  useEffect(() => {
    try {
      const r = window.localStorage.getItem(LS_RAILED);
      if (r === '1') setRailed(true);
      const s = window.localStorage.getItem(LS_SECTIONS);
      if (s) {
        const parsed = JSON.parse(s) as LensKey[];
        if (Array.isArray(parsed)) setClosedSections(new Set(parsed));
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleRailed() {
    setRailed((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(LS_RAILED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleSection(key: LensKey) {
    setClosedSections((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          LS_SECTIONS,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="lib-page">
      <header className="lib-page-head">
        <div>
          <h1 className="lib-page-title">Library</h1>
          <p className="lib-page-subtitle">
            Your reusable teaching notes — author once, reuse across
            cohorts and programmes.
          </p>
        </div>
      </header>

      <div className="lib-toolbar">
        <div className="lib-search">
          <svg
            className="lib-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search notes…"
            disabled
            aria-label="Search notes"
          />
        </div>
        <button className="lib-btn" disabled title="Coming in slice 11.2">
          + New folder
        </button>
        <button
          className="lib-btn lib-btn-primary"
          disabled
          title="Coming in slice 11.3"
        >
          + New note
        </button>
      </div>

      <div className={`lib-body${railed ? ' is-railed' : ''}`}>
        <aside
          className={`lens-side${railed ? ' is-railed' : ''}`}
          aria-label="Library lenses"
        >
          <button
            className="lens-rail-toggle"
            onClick={toggleRailed}
            aria-label={railed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={railed ? 'Expand sidebar' : 'Collapse to icon rail'}
          >
            {railed ? '»' : '«'}
          </button>

          {ALL_SECTIONS.map((key) => (
            <LensSection
              key={key}
              lens={key}
              railed={railed}
              closed={closedSections.has(key)}
              onToggle={() => toggleSection(key)}
            />
          ))}
        </aside>

        <main className="lib-main">
          <EmptyState />
        </main>
      </div>
    </div>
  );
}


function LensSection({
  lens,
  railed,
  closed,
  onToggle,
}: {
  lens: LensKey;
  railed: boolean;
  closed: boolean;
  onToggle: () => void;
}) {
  if (railed) {
    // Railed mode: one icon glyph per section, hovering shows the
    // label as a native tooltip.
    return (
      <div className="lens-section">
        <span
          className="lens-rail-icon"
          title={SECTION_LABEL[lens]}
          aria-label={SECTION_LABEL[lens]}
        >
          {SECTION_RAIL_GLYPH[lens]}
        </span>
      </div>
    );
  }

  return (
    <div className={`lens-section${closed ? ' is-closed' : ''}`}>
      <button
        type="button"
        className="lens-section-head"
        onClick={onToggle}
        aria-expanded={!closed}
      >
        <span>{SECTION_LABEL[lens]}</span>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="lens-section-body">{renderLensBody(lens)}</div>
    </div>
  );
}


function renderLensBody(lens: LensKey) {
  switch (lens) {
    case 'views':
      // System views always render — they're structural, not data-
      // driven. Counts will land when slice 11.2 + 11.3 ship.
      return (
        <>
          <LensItem label="All notes" count={0} />
          <LensItem label="Recent" count={0} />
          <LensItem label="Drafts" count={0} />
          <LensItem label="Used nowhere" count={0} />
        </>
      );

    case 'folders':
      return (
        <>
          <LensItem label="All folders" count={0} />
          <div className="lens-empty">
            No folders yet — create one with + New folder.
          </div>
        </>
      );

    case 'shelves':
      return (
        <>
          <LensItem label="All shelves" count={0} />
          <div className="lens-empty">
            Curated packs across folders. Coming with shelves.
          </div>
        </>
      );

    case 'pillars':
      // The 8 NCLEX-RN Client Needs sub-categories. All counts zero
      // until notes exist.
      return (
        <>
          {PILLAR_NAMES.map((name) => (
            <LensItem key={name} label={name} count={0} />
          ))}
        </>
      );

    case 'tags':
      return (
        <div className="lens-empty">
          Tags from your notes appear here.
        </div>
      );
  }
}


function LensItem({ label, count }: { label: string; count: number }) {
  return (
    <button type="button" className="lens-item" disabled>
      <span className="label">{label}</span>
      <span className="cnt">{count}</span>
    </button>
  );
}


function EmptyState() {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        📒
      </div>
      <h2 className="lib-empty-title">Your library is empty</h2>
      <p className="lib-empty-sub">
        Notes you write live here forever — reuse them across cohorts,
        attach them to units, or group them into curated shelves.
        Start with a folder or jump straight to a new note.
      </p>
      <div className="lib-empty-actions">
        <button className="lib-btn" disabled title="Coming in slice 11.2">
          + New folder
        </button>
        <button
          className="lib-btn lib-btn-primary"
          disabled
          title="Coming in slice 11.3"
        >
          + New note
        </button>
      </div>
    </div>
  );
}
