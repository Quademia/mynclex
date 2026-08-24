// mynclex/lib/library/student/read-compact-chrome.tsx
//
// The phone chrome for read mode: the sticky compact topbar (back, crumb,
// "contents n/m" pill, bookmark, progress line) and the Contents bottom
// sheet that stands in for the desktop rail below 768px. Styled by
// styles/library-read-mobile.css; see that file's header for the layout.
//
// ⭐ WHY THIS IS A COMPONENT AND NOT COPIED INTO BOTH READERS. There are
// two read views — the student's (read-note-view.tsx) and the tutor's
// read-only preview of it (../programme/programme-note-read-view.tsx) —
// and they are separate files by design: one persists reading state and
// guards mid-practice navigation, the other is inert and carries a
// preview banner. What they share is exactly this chrome, down to the
// pixel, because the preview's whole job is to show a tutor what her
// student sees. Copied, the two would drift the first time either was
// touched, and the preview would quietly stop being a preview.
//
// ⚠ The DIFFERENCES stay in the callers, as props: whether the bookmark
// writes to a server, whether leaving needs a confirm, and whether there
// is a saved position to resume from (a tutor has no reading state, so
// the student's Resume chip is rendered by that caller, not here).
//
// ⚠⚠ The sheet is PORTALLED TO <body>, and that is load-bearing rather
// than tidy: `.rdm` is a container, `container-type` applies layout
// containment, and a contained element becomes the containing block for
// fixed AND absolute descendants. A sheet left inside `.rdm` therefore
// pins to the note — which grows — instead of to the screen, and on a
// long note opens far below the fold. Full account in the stylesheet.

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReadHeading } from './read-blocks';
import { useRdmCompact } from './use-rdm-compact';

export function ReadCompactChrome({
  basePath,
  crumbLabel,
  headings,
  activeHeading,
  bookmarked,
  onToggleBookmark,
  bookmarkTitle,
  onNavAway,
  onPickHeading,
}: {
  basePath: string;
  /** The note's folder name when it has one, else "Library". */
  crumbLabel: string;
  headings: ReadHeading[];
  activeHeading: string | null;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  /** The preview passes its "inactive here" explanation. */
  bookmarkTitle?: string;
  /** The student's mid-practice confirm; the preview has none. */
  onNavAway?: (e: React.MouseEvent) => void;
  onPickHeading: (id: string) => void;
}) {
  const compact = useRdmCompact();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  // The reading-progress line. Its own listener rather than a prop: it
  // feeds nothing but the 2px rule under the topbar, and otherwise both
  // readers would have to compute the same number on our behalf.
  //
  // ⓘ No synchronous first read — every write happens inside the
  // listener, which keeps this a subscription rather than a cascading
  // render. A freshly opened note sits at 0% anyway.
  useEffect(() => {
    const scroller = document.querySelector(
      '.product-content',
    ) as HTMLElement | null;
    const target: HTMLElement | Window = scroller ?? window;
    const read = () => {
      const top = scroller ? scroller.scrollTop : window.scrollY;
      const max = scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(max > 0 ? Math.min(100, Math.round((top / max) * 100)) : 0);
    };
    target.addEventListener('scroll', read, { passive: true });
    return () => target.removeEventListener('scroll', read);
  }, []);

  // Escape closes it, and the page behind does not scroll. Mirrors the
  // app drawer (components/shell/mobile/mobile-nav.tsx) rather than
  // sharing it — that is nav chrome, this is page content.
  //
  // ⓘ No "close when it stops being compact" effect: visibility is
  // derived below, so widening the reader cannot strand an open sheet.
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

  const activeIdx = headings.findIndex((h) => h.id === activeHeading);
  const sectionNum = activeIdx >= 0 ? activeIdx + 1 : headings.length ? 1 : 0;
  const progressPct =
    headings.length === 0 ? 0 : Math.round((sectionNum / headings.length) * 100);
  const sheetVisible = sheetOpen && compact;

  return (
    <>
      {/* In the DOM at every width; the layer shows it only below 768px,
          where it replaces .lib-read-toprow. */}
      <div className="rdm-topbar">
        <Link
          href={basePath}
          className="rdm-iconbtn"
          onClick={onNavAway}
          aria-label="Back to library"
        >
          ‹
        </Link>
        <span className="rdm-crumb">{crumbLabel}</span>
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
          title={bookmarkTitle}
        >
          {bookmarked ? '★' : '☆'}
        </button>
        <div className="rdm-progress" style={{ width: `${scrollPct}%` }} />
      </div>

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
                      onPickHeading(h.id);
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
    </>
  );
}
