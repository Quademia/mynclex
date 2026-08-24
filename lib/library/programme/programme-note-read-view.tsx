// mynclex/lib/library/programme/programme-note-read-view.tsx
//
// The note read view inside the tutor's programme-library preview — the
// read view a student opens, shown to the tutor read-only. A faithful
// mirror of lib/library/student/read-note-view.tsx (same two-column TOC
// + body layout, same .lib-read-* classes, same RenderBlocks body), with
// three differences for the preview:
//   • A tutor-only PREVIEW BANNER on top ("the read view a student
//     opens", with an "Edit this note ↗" link into /tutor/library).
//   • Bookmark / Mark-as-done render exactly as the student sees them but
//     are INERT — local toggles, no server writes (a tutor has no
//     reading state). Reading position isn't persisted either.
//   • Embedded-question blocks render read-only via <EmbedPreview> (the
//     questions students get, never scored or logged), injected through
//     RenderBlocks' renderEmbed seam.

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RenderBlocks, extractHeadings } from '../student/read-blocks';
import { ReadCompactChrome } from '../student/read-compact-chrome';
import type { ReadNode } from '../student/read-inline';
import { pillarShortName, formatRelative } from '../format';
import { EmbedPreview } from './embed-preview';
import type { ProgrammeNoteRead } from './note-read-queries';

const SCROLL_OFFSET = 130; // px below the top a heading must pass to be "active"

export function ProgrammeNoteReadView({
  note,
  basePath,
  noteEditHref,
}: {
  note: ProgrammeNoteRead;
  /** The programme library base, e.g. `/tutor/programme/<id>/library`. */
  basePath: string;
  /** Where "Edit this note ↗" links — the editable library note. */
  noteEditHref: string;
}) {
  const blocks = useMemo(
    () => (note.body.content ?? []) as ReadNode[],
    [note.body],
  );
  const headings = useMemo(() => extractHeadings(blocks), [blocks]);

  const [activeHeading, setActiveHeading] = useState<string | null>(
    headings[0]?.id ?? null,
  );
  // Inert local toggles — the tutor isn't a student; nothing persists.
  const [bookmarked, setBookmarked] = useState(false);
  const [done, setDone] = useState(false);

  // Scroll-spy on the app-shell scroll region (read-only; no persistence).
  useEffect(() => {
    if (headings.length === 0) return;
    const scroller =
      (document.querySelector('.product-content') as HTMLElement | null) ??
      null;

    const onScroll = () => {
      let current = headings[0].id;
      headings.forEach((h) => {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= SCROLL_OFFSET) {
          current = h.id;
        }
      });
      setActiveHeading(current);
    };

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener('scroll', onScroll);
  }, [headings]);

  function scrollToHeading(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  const activeIdx = headings.findIndex((h) => h.id === activeHeading);
  const sectionNum = activeIdx >= 0 ? activeIdx + 1 : headings.length ? 1 : 0;
  const progressPct =
    headings.length === 0 ? 0 : Math.round((sectionNum / headings.length) * 100);

  const renderEmbed = (noteId: string, blockId: string, title: string) => (
    <EmbedPreview noteId={noteId} blockId={blockId} title={title} />
  );

  return (
    <div className="lib-page">
      {/* Tutor-only preview banner — read-view variant */}
      <div className="tlib-preview">
        <span className="tlib-preview-ic">
          <svg
            viewBox="0 0 24 24"
            width={15}
            height={15}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        <span className="tlib-preview-txt">
          <b>Student preview</b> — the read view a student opens. Read-only.
        </span>
        <Link href={noteEditHref} className="tlib-preview-edit">
          Edit this note ↗
        </Link>
      </div>

      {/* The student's phone chrome, shared verbatim — the preview's job
          is to show what she sees, so a copy here would be a lie the
          moment either side changed. Read-only differences ride in as
          props: no nav guard, and a bookmark that only toggles locally. */}
      <div className="rdm">
      <ReadCompactChrome
        basePath={basePath}
        crumbLabel={note.folder ? note.folder.name : 'Library'}
        headings={headings}
        activeHeading={activeHeading}
        bookmarked={bookmarked}
        onToggleBookmark={() => setBookmarked((v) => !v)}
        bookmarkTitle="How the bookmark looks to students (inactive in preview)"
        onPickHeading={scrollToHeading}
      />

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
              <Link href={basePath} className="lib-read-crumb-link">
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
                  >
                    {note.folder.name}
                  </Link>
                </>
              )}
            </nav>
            <button
              type="button"
              className={'lib-read-bookmark' + (bookmarked ? ' is-on' : '')}
              onClick={() => setBookmarked((v) => !v)}
              aria-pressed={bookmarked}
              title="How the bookmark looks to students (inactive in preview)"
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
              >
                {pillarShortName(p)}
              </Link>
            ))}
            {note.tags.map((t) => (
              <Link
                key={t}
                href={`${basePath}?tag=${encodeURIComponent(t)}`}
                className="lib-tag-inline"
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
            <RenderBlocks
              blocks={blocks}
              ctx={{ noteId: note.note_id, renderEmbed }}
            />
          </div>

          <div className="lib-read-foot">
            <button
              type="button"
              className={'lib-read-done' + (done ? ' is-done' : '')}
              onClick={() => setDone((v) => !v)}
              aria-pressed={done}
              title="How Mark-as-done looks to students (inactive in preview)"
            >
              {done ? '✓ Marked done' : 'Mark as done'}
            </button>
          </div>
        </article>
      </div>
      </div>
    </div>
  );
}
