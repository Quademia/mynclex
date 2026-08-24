// mynclex/lib/library/student/read-note-view.tsx
//
// The student note read view (slice 11.13a). Two columns: a left
// Contents rail (auto-built from H2/H3 headings, scroll-spy highlight,
// "section N of M" progress) and the note body rendered read-only by
// RenderBlocks. Header carries a back pill, bookmark toggle, title,
// subtitle and a meta row; the foot carries Mark-as-done.
//
// Per-note state (bookmark / done / resume position) persists in
// nclex_library_note_state via the note-read actions. The page scrolls
// inside the app shell's `.product-content` region (slice 2.9 locked
// viewport), so scroll-spy listens there.

'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { RenderBlocks, extractHeadings } from './read-blocks';
import { isRdmCompactNow, useRdmCompact } from './use-rdm-compact';
import { EmbedPlayGuardContext } from './embed-play-guard';
import { pillarShortName, formatRelative } from '../format';
import type { ReadNode } from './read-inline';
import type { StudentNoteRead } from './note-read-queries';
import {
  toggleNoteBookmarkAction,
  toggleNoteDoneAction,
  updateReadingPositionAction,
} from './note-read-actions';

const SCROLL_OFFSET = 130; // px below the top a heading must pass to be "active"

// Shown when the student tries to leave the note mid-practice. Honest:
// answers already submitted are saved; only the in-progress set restarts.
const LEAVE_PRACTICE_MSG =
  'You are in the middle of a practice set. Your answers so far are saved, ' +
  'but you will start this set over next time. Leave anyway?';

export function ReadNoteView({
  note,
  basePath,
}: {
  note: StudentNoteRead;
  basePath: string;
}) {
  const blocks = useMemo(
    () => (note.body.content ?? []) as ReadNode[],
    [note.body],
  );
  const headings = useMemo(() => extractHeadings(blocks), [blocks]);

  const [activeHeading, setActiveHeading] = useState<string | null>(
    note.state.lastHeadingId,
  );
  const [bookmarked, setBookmarked] = useState(note.state.bookmarked);
  const [done, setDone] = useState(note.state.done);

  // ── Compact (phone) read mode ──────────────────────────────────────
  // The layout is CSS (library-read-mobile.css). These carry the parts
  // CSS cannot express: which resume behaviour to use, and the Contents
  // sheet that stands in for the rail it hides.
  const compact = useRdmCompact();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [, startTransition] = useTransition();

  // ── Leave-mid-practice guard ──
  // Embed players report when their set is mid-run; while any is, warn
  // before leaving (refresh/close via beforeunload + the note's own
  // back / breadcrumb / chip links via a confirm). The global sidebar
  // isn't intercepted (App Router has no clean nav-block hook).
  const [playingBlocks, setPlayingBlocks] = useState<Set<string>>(
    () => new Set(),
  );
  const setBlockPlaying = useCallback((blockId: string, playing: boolean) => {
    setPlayingBlocks((prev) => {
      if (playing === prev.has(blockId)) return prev;
      const next = new Set(prev);
      if (playing) next.add(blockId);
      else next.delete(blockId);
      return next;
    });
  }, []);
  const guardValue = useMemo(() => ({ setBlockPlaying }), [setBlockPlaying]);
  const guardActive = playingBlocks.size > 0;

  useEffect(() => {
    if (!guardActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guardActive]);

  const onGuardedNav = useCallback(
    (e: React.MouseEvent) => {
      if (guardActive && !window.confirm(LEAVE_PRACTICE_MSG)) {
        e.preventDefault();
      }
    },
    [guardActive],
  );

  // Resume on open. On DESKTOP this jumps straight to the deepest heading
  // the student reached, if it still exists — unchanged since 11.13a.
  //
  // ⭐ ON A PHONE IT DELIBERATELY DOES NOT. Jumping drops the reader into
  // the middle of a note with the title and the Contents pill already
  // scrolled past, so the student cannot tell what she is looking at or
  // that a jump happened. The compact layer offers a "Resume · <section>"
  // chip instead: same destination, but she chooses it and keeps her
  // bearings. Without this branch the chip would be nonsense — she would
  // already be there, reading a button offering to take her.
  //
  // ⚠ Reads the width ONCE, synchronously, rather than waiting for
  // useRdmCompact's observer: this fires on mount and must decide before
  // the first paint settles. The hook still owns every later answer.
  useEffect(() => {
    const target = note.state.lastHeadingId;
    if (!target) return;
    if (isRdmCompactNow()) return; // the chip offers it instead
    document.getElementById(target)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reading-progress line on the compact topbar, and the one-shot dismissal
  // of the Resume chip. Separate from the scroll-spy below because that one
  // returns early when a note has no headings — the progress line should
  // still move on a note that is one long section.
  //
  // ⓘ No synchronous first read: every state write happens in the listener,
  // which is what keeps this a subscription rather than a cascading render.
  // A fresh note opens at 0% anyway, and a restored or auto-jumped scroll
  // position fires a scroll event of its own.
  useEffect(() => {
    const scroller = document.querySelector(
      '.product-content',
    ) as HTMLElement | null;
    const target: HTMLElement | Window = scroller ?? window;
    const onScrollRead = () => {
      const top = scroller ? scroller.scrollTop : window.scrollY;
      const max = scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(max > 0 ? Math.min(100, Math.round((top / max) * 100)) : 0);
      // Once she has scrolled on her own, the offer to resume is stale.
      if (top > 260) setResumeDismissed(true);
    };
    target.addEventListener('scroll', onScrollRead, { passive: true });
    return () => target.removeEventListener('scroll', onScrollRead);
  }, []);

  // Contents sheet: Escape closes it and the page behind it does not
  // scroll. Mirrors the app drawer's behaviour
  // (components/shell/mobile/mobile-nav.tsx) rather than sharing it — one
  // is nav chrome, this is page content.
  //
  // ⓘ There is no "close when it stops being compact" effect: visibility is
  // DERIVED below (`sheetOpen && compact`), so widening the reader cannot
  // leave a sheet stranded on a desktop layout.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sheetOpen]);

  // Stamp the visit on open (slice 11.14c) — upserts last_visited_at while
  // preserving the existing resume position, so EVERY opened note surfaces
  // in the Study Home's Recent / Continue-reading, not only those where the
  // student scrolled past a heading. Fire-and-forget; runs once.
  useEffect(() => {
    void updateReadingPositionAction(note.note_id, note.state.lastHeadingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy on the app-shell scroll region. Tracks the deepest
  // heading scrolled past and persists it (debounced) — never regressing
  // to an earlier heading within the session.
  const maxIdxRef = useRef(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    const scroller =
      (document.querySelector('.product-content') as HTMLElement | null) ??
      null;

    const persist = (headingId: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void updateReadingPositionAction(note.note_id, headingId);
      }, 1500);
    };

    const onScroll = () => {
      let current = headings[0].id;
      let currentIdx = 0;
      headings.forEach((h, i) => {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= SCROLL_OFFSET) {
          current = h.id;
          currentIdx = i;
        }
      });
      setActiveHeading(current);
      if (currentIdx > maxIdxRef.current) {
        maxIdxRef.current = currentIdx;
        persist(current);
      }
    };

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [headings, note.note_id]);

  function scrollToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function onToggleBookmark() {
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    startTransition(async () => {
      const res = await toggleNoteBookmarkAction(note.note_id);
      if (!res.ok) setBookmarked(!next);
      else setBookmarked(res.active);
    });
  }

  function onToggleDone() {
    const next = !done;
    setDone(next); // optimistic
    startTransition(async () => {
      const res = await toggleNoteDoneAction(note.note_id);
      if (!res.ok) setDone(!next);
      else setDone(res.active);
    });
  }

  const activeIdx = headings.findIndex((h) => h.id === activeHeading);
  const sectionNum = activeIdx >= 0 ? activeIdx + 1 : headings.length ? 1 : 0;
  const progressPct =
    headings.length === 0 ? 0 : Math.round((sectionNum / headings.length) * 100);

  // ── Derived compact state ──────────────────────────────────────────
  // Both are computed rather than stored, so neither can be left stranded
  // by a resize: widen the reader and the sheet and chip simply stop
  // existing, with no effect needed to tidy up after them.
  const resumeTarget =
    compact && !resumeDismissed ? note.state.lastHeadingId : null;
  const sheetVisible = sheetOpen && compact;

  // The chip names where it would take her. A saved heading that no longer
  // exists (the tutor edited the note) still resolves to a usable label.
  const resumeLabel =
    (resumeTarget && headings.find((h) => h.id === resumeTarget)?.text) ||
    'where you left off';

  return (
    <EmbedPlayGuardContext.Provider value={guardValue}>
      <div className="rdm">
      {/* ── Compact topbar. In the DOM at every width; the layer shows it
          only below 900px, where it replaces .lib-read-toprow. ── */}
      <div className="rdm-topbar">
        <Link
          href={basePath}
          className="rdm-iconbtn"
          onClick={onGuardedNav}
          aria-label="Back to library"
        >
          ‹
        </Link>
        <span className="rdm-crumb">
          {note.folder ? note.folder.name : 'Library'}
        </span>
        {headings.length > 0 && (
          <button
            type="button"
            className="rdm-contents"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
          >
            ☰{' '}
            <span className="n">
              {sectionNum}/{headings.length}
            </span>
          </button>
        )}
        <button
          type="button"
          className={'rdm-iconbtn' + (bookmarked ? ' is-on' : '')}
          onClick={onToggleBookmark}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this note'}
        >
          {bookmarked ? '★' : '☆'}
        </button>
        <div className="rdm-progress" style={{ width: `${scrollPct}%` }} />
      </div>

      {resumeTarget && (
        <div className="rdm-resume">
          <button
            type="button"
            onClick={() => {
              scrollToHeading(resumeTarget);
              setResumeDismissed(true);
            }}
          >
            ▶ <span className="sec">Resume · {resumeLabel}</span>
          </button>
        </div>
      )}

      <div className="lib-read-shell">
      {/* Contents rail */}
      <aside className="lib-read-toc" aria-label="Contents">
        <div className="lib-read-toc-title">Contents</div>
        {headings.length === 0 ? (
          <div className="lib-read-toc-empty">No sections.</div>
        ) : (
          <>
            <nav>
              {headings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={
                    'lib-read-toc-link' +
                    (h.level === 3 ? ' is-h3' : '') +
                    (activeHeading === h.id ? ' is-active' : '')
                  }
                  onClick={() => scrollToHeading(h.id)}
                >
                  {h.text || 'Untitled'}
                </button>
              ))}
            </nav>
            <div className="lib-read-progress">
              <div className="lib-read-progress-label">
                section {sectionNum} of {headings.length}
              </div>
              <div className="lib-read-progress-bar">
                <div style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Body */}
      <article className="lib-read-body">
        <div className="lib-read-toprow">
          <nav className="lib-read-crumb" aria-label="Breadcrumb">
            <Link
              href={basePath}
              className="lib-read-crumb-link"
              onClick={onGuardedNav}
            >
              Library
            </Link>
            {note.folder && (
              <>
                <span className="lib-read-crumb-sep" aria-hidden="true">
                  /
                </span>
                <Link
                  href={`${basePath}?folder=${note.folder.folder_id}`}
                  className="lib-read-crumb-link"
                  onClick={onGuardedNav}
                >
                  {note.folder.name}
                </Link>
              </>
            )}
          </nav>
          <button
            type="button"
            className={'lib-read-bookmark' + (bookmarked ? ' is-on' : '')}
            onClick={onToggleBookmark}
            aria-pressed={bookmarked}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this note'}
          >
            {bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
          </button>
        </div>

        <h1 className="lib-read-title">{note.title}</h1>
        {note.subtitle && <p className="lib-read-subtitle">{note.subtitle}</p>}

        <div className="lib-read-meta">
          {note.shelves.map((s) => (
            <Link
              key={s.shelf_id}
              href={`${basePath}?shelf=${s.shelf_id}`}
              className="lib-meta-chip lib-meta-chip-shelf"
              title={`On shelf: ${s.title}`}
              onClick={onGuardedNav}
            >
              <span
                className="lib-meta-shelf-dot"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              {s.title}
            </Link>
          ))}
          {note.pillars.map((p) => (
            <Link
              key={p}
              href={`${basePath}?pillar=${encodeURIComponent(p)}`}
              className="lib-meta-chip"
              title={p}
              onClick={onGuardedNav}
            >
              {pillarShortName(p)}
            </Link>
          ))}
          {note.tags.map((t) => (
            <Link
              key={t}
              href={`${basePath}?tag=${encodeURIComponent(t)}`}
              className="lib-tag-inline"
              onClick={onGuardedNav}
            >
              #{t}
            </Link>
          ))}
          <span className="lib-read-meta-spacer" />
          <span className="lib-read-meta-dim">
            🕐 {note.readingMinutes} min read
          </span>
          <span className="lib-read-meta-dim">
            · updated {formatRelative(note.updated_at)}
          </span>
        </div>

        <div className="lib-read-prose">
          <RenderBlocks blocks={blocks} ctx={{ noteId: note.note_id }} />
        </div>

        <div className="lib-read-foot">
          <button
            type="button"
            className={'lib-read-done' + (done ? ' is-done' : '')}
            onClick={onToggleDone}
            aria-pressed={done}
          >
            {done ? '✓ Marked done' : 'Mark as done'}
          </button>
        </div>
      </article>
      </div>

      {/* ── Contents sheet ────────────────────────────────────────────────
          ⚠ PORTALLED TO <body> ON PURPOSE. `.rdm` is a container, and
          container-type applies layout containment, which makes it the
          containing block for fixed descendants — so a sheet left inside
          it pins to the note (which grows), not to the screen. See the
          header of styles/library-read-mobile.css. */}
      {sheetVisible &&
        createPortal(
          <>
            <button
              type="button"
              className="rdm-scrim"
              aria-label="Close contents"
              onClick={() => setSheetOpen(false)}
            />
            <div
              className="rdm-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Contents"
            >
              <div className="rdm-sheet-grab" aria-hidden="true" />
              <div className="rdm-sheet-head">
                <span className="rdm-sheet-title">Contents</span>
                <span className="rdm-sheet-prog">
                  section {sectionNum} of {headings.length}
                </span>
              </div>
              <div className="rdm-sheet-bar">
                <div style={{ width: `${progressPct}%` }} />
              </div>
              <div className="rdm-sheet-list">
                {headings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={
                      'rdm-sheet-link' +
                      (h.level === 3 ? ' is-h3' : '') +
                      (activeHeading === h.id ? ' is-active' : '')
                    }
                    onClick={() => {
                      scrollToHeading(h.id);
                      setSheetOpen(false);
                    }}
                  >
                    {h.text || 'Untitled'}
                    {activeHeading === h.id && (
                      <span className="tick" aria-hidden="true">
                        ●
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
      </div>
    </EmbedPlayGuardContext.Provider>
  );
}
