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
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { RenderBlocks, extractHeadings } from './read-blocks';
import { pillarShortName, formatRelative } from '../format';
import type { ReadNode } from './read-inline';
import type { StudentNoteRead } from './note-read-queries';
import {
  toggleNoteBookmarkAction,
  toggleNoteDoneAction,
  updateReadingPositionAction,
} from './note-read-actions';

const SCROLL_OFFSET = 130; // px below the top a heading must pass to be "active"

export function ReadNoteView({
  note,
  basePath,
  backLabel = 'Library',
}: {
  note: StudentNoteRead;
  basePath: string;
  backLabel?: string;
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
  const [, startTransition] = useTransition();

  // Resume on open — scroll to the deepest heading the student reached,
  // if it still exists. Runs once.
  useEffect(() => {
    const target = note.state.lastHeadingId;
    if (!target) return;
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ block: 'start' });
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

  return (
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
          <Link href={basePath} className="lib-read-back">
            ← Back to {backLabel}
          </Link>
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
          {note.pillars.map((p) => (
            <span key={p} className="lib-meta-chip" title={p}>
              {pillarShortName(p)}
            </span>
          ))}
          {note.tags.map((t) => (
            <span key={t} className="lib-tag-inline">
              #{t}
            </span>
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
  );
}
