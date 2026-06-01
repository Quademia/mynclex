// mynclex/lib/library/student/study-home.tsx
//
// The student library "Study Home" main pane (slice 11.14c). Ported from
// the Claude Design handoff's Variant A ("hero-led"): a Continue-reading
// hero, a four-tile stat row, a Recently-opened / Bookmarked two-column
// pair, and a Browse section. Read-only throughout — no create/edit.
//
// Renders ONLY the pane content (`.sh`); the surrounding shell supplies
// the welcome header + lens sidebar (it swaps in a personalised header on
// home scope — see student-library-shell). Every value is real:
//   • progress / bookmarks / recents  → home.stateByNote (+ snapshot.notes)
//   • continue-reading progress        → home.continueProgress
//   • practice + accuracy              → home.practice
//
// Divergences from the prototype (deliberate, noted for the slice):
//   • The hero thumbnail is a GENERATED placeholder (our notes carry no
//     cover image) — initials over a tinted tile.
//   • Per-recent-row resume section text is only shown for the single
//     continue note (others show "In progress") to avoid N body fetches.

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { formatRelative, pillarShortName } from '../format';
import { ShIcons } from './study-home-icons';
import type { StudentLibrarySnapshot } from './queries';
import type { StudentLibraryHome, StudentNoteState } from './home-queries';
import type { LibraryNoteLensRow } from '../types';

interface StudyHomeProps {
  home: StudentLibraryHome;
  snapshot: StudentLibrarySnapshot;
  basePath: string;
}

// Up-to-2-letter initials for the generated thumbnail.
function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function StudentStudyHome({ home, snapshot, basePath }: StudyHomeProps) {
  const { notes } = snapshot;
  const { stateByNote, practice, continueProgress } = home;

  const noteById = useMemo(() => {
    const m = new Map<string, LibraryNoteLensRow>();
    notes.forEach((n) => m.set(n.note_id, n));
    return m;
  }, [notes]);

  const isNew = Object.keys(stateByNote).length === 0;
  const notesTotal = notes.length;
  const notesRead = Object.values(stateByNote).filter((s) => s.done).length;
  const bookmarkedCount = Object.values(stateByNote).filter(
    (s) => s.bookmarkedAt != null,
  ).length;

  // Recently opened — visited notes, newest first, top 5.
  const recent = useMemo(() => {
    return Object.entries(stateByNote)
      .filter(([, s]) => s.lastVisitedAt != null)
      .sort(([, a], [, b]) =>
        (b.lastVisitedAt ?? '').localeCompare(a.lastVisitedAt ?? ''),
      )
      .slice(0, 5)
      .map(([noteId, s]) => ({ note: noteById.get(noteId), state: s, noteId }))
      .filter((r): r is { note: LibraryNoteLensRow; state: StudentNoteState; noteId: string } => !!r.note);
  }, [stateByNote, noteById]);

  // Bookmarked — newest bookmark first, top 5.
  const bookmarked = useMemo(() => {
    return Object.entries(stateByNote)
      .filter(([, s]) => s.bookmarkedAt != null)
      .sort(([, a], [, b]) =>
        (b.bookmarkedAt ?? '').localeCompare(a.bookmarkedAt ?? ''),
      )
      .slice(0, 5)
      .map(([noteId, s]) => ({ note: noteById.get(noteId), state: s }))
      .filter((r): r is { note: LibraryNoteLensRow; state: StudentNoteState } => !!r.note);
  }, [stateByNote, noteById]);

  // Browse counts (hide-empty, matching the sidebar).
  const visibleFolders = useMemo(() => {
    const ids = new Set(notes.map((n) => n.folder_id).filter(Boolean));
    return snapshot.folders.filter((f) => ids.has(f.folder_id)).length;
  }, [notes, snapshot.folders]);
  const visibleShelves = useMemo(() => {
    const ids = new Set(notes.flatMap((n) => n.shelf_memberships.map((s) => s.shelf_id)));
    return snapshot.shelves.filter((s) => ids.has(s.shelf_id)).length;
  }, [notes, snapshot.shelves]);
  const pillarsPresent = useMemo(
    () => new Set(notes.flatMap((n) => n.pillars)).size,
    [notes],
  );

  const contNote = continueProgress
    ? noteById.get(continueProgress.noteId)
    : null;

  return (
    <div className="lib-study-home">
      <div className="sh">
        {/* 1 — Continue reading hero */}
        {isNew ? (
          <HeroEmpty
            firstNote={notes[0] ?? null}
            tutorName={home.tutorName}
            notesTotal={notesTotal}
            folders={visibleFolders}
            basePath={basePath}
          />
        ) : continueProgress && contNote ? (
          <Hero
            note={contNote}
            progress={continueProgress}
            basePath={basePath}
          />
        ) : (
          <HeroCaughtUp basePath={basePath} />
        )}

        {/* 2 — Stat row */}
        <div className="stat-row">
          <Stat
            icon="check"
            label="Notes read"
            value={notesRead}
            unit={`/ ${notesTotal}`}
            bar={notesTotal ? Math.round((notesRead / notesTotal) * 100) : 0}
            muted={notesRead === 0}
            sub={
              notesRead === 0
                ? 'Mark notes done as you finish'
                : `${Math.round((notesRead / notesTotal) * 100)}% of your library`
            }
          />
          <Stat
            icon="bookmark"
            navy
            label="Bookmarked"
            value={bookmarkedCount}
            muted={bookmarkedCount === 0}
            sub={
              bookmarkedCount === 0
                ? 'Save notes to revisit'
                : 'Saved for quick access'
            }
          />
          <Stat
            icon="target"
            label="Questions practised"
            value={practice.questionsPractised}
            muted={practice.questionsPractised === 0}
            sub={
              practice.questionsPractised === 0
                ? 'Try the questions inside notes'
                : 'Embedded in your notes'
            }
          />
          <Stat
            icon="chart"
            navy
            label="Accuracy"
            value={practice.accuracyPct ?? '—'}
            unit={practice.accuracyPct != null ? '%' : ''}
            muted={practice.accuracyPct == null}
            sub={
              practice.accuracyPct == null
                ? 'Builds as you practise'
                : 'Across all attempts'
            }
          />
        </div>

        {/* 3 — Recently opened + Bookmarked */}
        <div className="sh-cols">
          <div>
            <div className="sh-block-label">
              Recently opened
              {recent.length > 0 && (
                <Link className="more" href={`${basePath}?view=recent`}>
                  View all {ShIcons.arrowR({ size: 12 })}
                </Link>
              )}
            </div>
            <div className="panel">
              {recent.length === 0 ? (
                <PanelEmpty
                  icon="clock"
                  title="Nothing opened yet"
                  sub="Notes you open appear here so you can jump straight back in."
                />
              ) : (
                recent.map(({ note, state, noteId }) => {
                  const resumeLabel =
                    continueProgress?.noteId === noteId
                      ? continueProgress.sectionLabel
                      : null;
                  return (
                    <Link
                      key={noteId}
                      href={`${basePath}/note/${noteId}`}
                      className="row"
                    >
                      <span className="row-ico">{ShIcons.doc({ size: 15 })}</span>
                      <span className="row-body">
                        <span className="row-title">{note.title}</span>
                        <span className="row-sub">
                          <span>
                            {state.lastVisitedAt
                              ? formatRelative(state.lastVisitedAt)
                              : ''}
                          </span>
                          {state.done ? (
                            <>
                              <span className="dot">·</span>
                              <span>Read</span>
                            </>
                          ) : (
                            <>
                              <span className="dot">·</span>
                              <span className="row-resume">
                                {ShIcons.play({ size: 10 })}{' '}
                                {resumeLabel ?? 'In progress'}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="row-right">
                        {state.done && (
                          <span className="row-done">
                            {ShIcons.check({ size: 10 })}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="sh-block-label">
              Bookmarked
              {bookmarked.length > 0 && (
                <Link className="more" href={`${basePath}?view=bookmarked`}>
                  View all {ShIcons.arrowR({ size: 12 })}
                </Link>
              )}
            </div>
            <div className="panel">
              {bookmarked.length === 0 ? (
                <PanelEmpty
                  icon="bookmark"
                  title="No bookmarks yet"
                  sub="Tap the bookmark icon on any note to save it here for later."
                />
              ) : (
                bookmarked.map(({ note }) => (
                  <Link
                    key={note.note_id}
                    href={`${basePath}/note/${note.note_id}`}
                    className="row"
                  >
                    <span className="row-ico">
                      <span className="bk">
                        {ShIcons.bookmark({ size: 15, fill: 'currentColor', sw: 0 })}
                      </span>
                    </span>
                    <span className="row-body">
                      <span className="row-title">{note.title}</span>
                      <span className="row-sub">
                        <span aria-hidden="true">📁</span>
                        <span>{note.folder_name ?? 'Root'}</span>
                      </span>
                    </span>
                    <span className="row-right">
                      {ShIcons.arrowR({ size: 13 })}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 4 — Browse */}
        <div>
          <div className="sh-block-label">Browse the library</div>
          <div className="browse-grid">
            <BrowseCard
              icon="grid"
              title="All notes"
              meta={`${notesTotal} note${notesTotal === 1 ? '' : 's'} shared with you`}
              href={`${basePath}?view=all-notes`}
            />
            <BrowseCard
              icon="folder"
              title="Folders"
              meta={`${visibleFolders} folder${visibleFolders === 1 ? '' : 's'}`}
              href={`${basePath}?folder=all`}
            />
            <BrowseCard
              icon="shelves"
              title="Shelves"
              meta={`${visibleShelves} curated pack${visibleShelves === 1 ? '' : 's'}`}
              href={`${basePath}?shelf=all`}
            />
            <BrowseCard
              icon="spark"
              title="NCLEX pillars"
              meta={`${pillarsPresent} Client-Needs categor${pillarsPresent === 1 ? 'y' : 'ies'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hero variants ──────────────────────────────────────────────────────

function Thumb({ title }: { title: string }) {
  return (
    <div className="lib-sh-thumb" aria-hidden="true">
      <span>{initials(title)}</span>
    </div>
  );
}

function Hero({
  note,
  progress,
  basePath,
}: {
  note: LibraryNoteLensRow;
  progress: NonNullable<StudentLibraryHome['continueProgress']>;
  basePath: string;
}) {
  const shelf = note.shelf_memberships[0];
  const pillar = note.pillars[0];
  return (
    <div className="hero">
      <div>
        <div className="hero-eyebrow">
          {ShIcons.clock({ size: 13 })} Continue reading
        </div>
        <h2 className="hero-title">{note.title}</h2>
        {progress.sectionLabel && (
          <div className="hero-resume-at">
            You left off in <b>{progress.sectionLabel}</b>
          </div>
        )}
        {progress.sTotal > 0 && (
          <div className="hero-progress">
            <div className="hero-bar">
              <div
                className="hero-bar-fill"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <span className="hero-progress-txt">
              Section {progress.sIndex} of {progress.sTotal} · ~
              {progress.minsLeft} min left
            </span>
          </div>
        )}
        <div className="hero-meta">
          {note.folder_name && (
            <span className="lens-bit">
              <span className="icn" aria-hidden="true">
                📁
              </span>
              <span className="v">{note.folder_name}</span>
            </span>
          )}
          {shelf && (
            <span className="lens-bit">
              <span className="icn" aria-hidden="true">
                📚
              </span>
              <span className="pip" style={{ background: shelf.color }} />
              <span className="v">{shelf.title}</span>
            </span>
          )}
          {pillar && (
            <span className="lens-bit" title={pillar}>
              <span className="v">{pillarShortName(pillar)}</span>
            </span>
          )}
        </div>
      </div>
      <div className="hero-side">
        <Thumb title={note.title} />
        <Link
          href={`${basePath}/note/${note.note_id}`}
          className="btn btn-accent"
        >
          {ShIcons.play({ size: 14 })} Resume
        </Link>
      </div>
    </div>
  );
}

function HeroEmpty({
  firstNote,
  tutorName,
  notesTotal,
  folders,
  basePath,
}: {
  firstNote: LibraryNoteLensRow | null;
  tutorName: string | null;
  notesTotal: number;
  folders: number;
  basePath: string;
}) {
  const tutor = tutorName ?? 'your tutor';
  return (
    <div className="hero empty">
      <div>
        <div className="hero-eyebrow">{ShIcons.spark({ size: 13 })} Start studying</div>
        <h2 className="hero-title">Welcome to {tutor}&apos;s library</h2>
        <p className="hero-empty-copy">
          {tutor} has shared <b>{notesTotal} note{notesTotal === 1 ? '' : 's'}</b>
          {folders > 0 && <> across {folders} folder{folders === 1 ? '' : 's'}</>}{' '}
          with you. Start anywhere — your reading position saves automatically,
          so you can always pick up where you left off.
        </p>
        {firstNote && (
          <Link
            href={`${basePath}/note/${firstNote.note_id}`}
            className="hero-suggest"
          >
            <span className="sg-ico">{ShIcons.book({ size: 17 })}</span>
            <span>
              <span className="sg-title">{firstNote.title}</span>
              <span className="sg-sub">
                A good place to begin · {firstNote.folder_name ?? 'Root'}
              </span>
            </span>
          </Link>
        )}
        {firstNote && (
          <Link
            href={`${basePath}/note/${firstNote.note_id}`}
            className="btn btn-accent"
          >
            {ShIcons.play({ size: 14 })} Start reading
          </Link>
        )}
      </div>
    </div>
  );
}

function HeroCaughtUp({ basePath }: { basePath: string }) {
  return (
    <div className="hero empty">
      <div>
        <div className="hero-eyebrow">{ShIcons.check({ size: 13 })} All caught up</div>
        <h2 className="hero-title">Nothing in progress</h2>
        <p className="hero-empty-copy">
          You&apos;ve finished everything you&apos;ve opened. Browse the library
          to pick your next note.
        </p>
        <Link href={`${basePath}?view=all-notes`} className="btn btn-accent">
          {ShIcons.grid({ size: 14 })} Browse all notes
        </Link>
      </div>
    </div>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────

function Stat({
  icon,
  navy,
  label,
  value,
  unit,
  sub,
  bar,
  muted,
}: {
  icon: keyof typeof ShIcons;
  navy?: boolean;
  label: string;
  value: number | string;
  unit?: string;
  sub?: string;
  bar?: number;
  muted?: boolean;
}) {
  return (
    <div className={'stat' + (muted ? ' muted' : '')}>
      <div className="stat-top">
        <span className={'stat-ico' + (navy ? ' navy' : '')}>
          {ShIcons[icon]({})}
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="unit"> {unit}</span>}
      </div>
      {bar != null && (
        <div className="stat-bar">
          <div className="stat-bar-fill" style={{ width: `${bar}%` }} />
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function PanelEmpty({
  icon,
  title,
  sub,
}: {
  icon: keyof typeof ShIcons;
  title: string;
  sub: string;
}) {
  return (
    <div className="panel-empty">
      <div className="pe-ico">{ShIcons[icon]({ size: 19 })}</div>
      <div className="pe-title">{title}</div>
      <div className="pe-sub">{sub}</div>
    </div>
  );
}

function BrowseCard({
  icon,
  title,
  meta,
  href,
}: {
  icon: keyof typeof ShIcons;
  title: string;
  meta: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="browse-ico">{ShIcons[icon]({})}</span>
      <span>
        <span className="browse-title">{title}</span>
        <span className="browse-meta">{meta}</span>
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="browse-card">
        {inner}
      </Link>
    );
  }
  return <div className="browse-card is-static">{inner}</div>;
}
