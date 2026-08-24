// mynclex/lib/library/student/library-scope-bar.tsx
//
// The student library's phone navigation, below 768px: a scrolling row of
// scope chips under the page head, plus a "Browse" bottom sheet holding
// the complete lens tree. Styled by styles/library-student-mobile.css.
//
// ⭐ WHY THIS EXISTS AT ALL. The desktop lens sidebar is 220px wide and
// never collapsed on its own, which left the notes pane 57px wide at
// 375px — measured, with 40px of it unreachable because the shell locks
// the document scroll. The rail also carried 84 items at 28.8px each,
// none of them a 44px target. So the phone answer is not a narrower rail:
// it is chips for the handful of scopes people actually reach for, and a
// sheet for everything else.
//
// ⚠ THE CHIPS ARE A SHORTCUT, THE SHEET IS THE WHOLE MENU — the same
// contract the app drawer keeps (components/shell/mobile/mobile-nav.tsx).
// Anything reachable from the sidebar must be reachable from the sheet,
// which is why the sheet renders the SAME LensSectionData the sidebar
// renders rather than a hand-kept second list. One array, two renderers;
// they cannot drift.
//
// ⚠⚠ Sheet and scrim are PORTALLED TO <body>. `.slm` is a container, and
// container-type applies layout containment, which makes it the
// containing block for fixed AND absolute descendants — so a sheet left
// inside it pins to the page, which is as tall as the note list, instead
// of to the screen. Same trap and same fix as the reader's contents
// sheet; the full account is in styles/library-read-mobile.css.

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCompactContainer } from './use-rdm-compact';

/** One row in the lens tree — a link, or a disabled entry with a hint. */
export type LensRow = {
  key: string;
  label: string;
  /** Absent = disabled (the "By unit" placeholder). */
  href?: string;
  /** Full text when the label is shortened (pillar names). */
  title?: string;
  count?: number;
  active: boolean;
  /** Shelf pip colour. */
  dotColor?: string;
  /** Why a disabled row is disabled. */
  hint?: string;
};

export type LensSectionData = {
  key: string;
  title: string;
  glyph: string;
  rows: LensRow[];
};

export function LibraryScopeBar({
  basePath,
  sections,
  notesCount,
  bookmarkCount,
  scopeKind,
}: {
  basePath: string;
  sections: LensSectionData[];
  notesCount: number;
  bookmarkCount?: number;
  /** The active scope, for chip highlighting. */
  scopeKind: string;
}) {
  const compact = useCompactContainer('.slm');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Escape closes; the page behind does not scroll. Copied in behaviour
  // from the app drawer rather than shared with it — that is shell nav,
  // this is page content.
  //
  // ⓘ No "close when it stops being compact" effect: visibility is
  // derived below, so widening the shell cannot strand an open sheet.
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

  const sheetVisible = sheetOpen && compact;

  return (
    <>
      <nav className="slm-scopebar" aria-label="Library scopes">
        <button
          type="button"
          className="slm-chip is-browse"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
        >
          <span className="ico" aria-hidden="true">
            ☰
          </span>
          Browse
        </button>
        <Link
          href={basePath}
          className={'slm-chip' + (scopeKind === 'home' ? ' is-active' : '')}
        >
          <span className="ico" aria-hidden="true">
            🏠
          </span>
          Home
        </Link>
        <Link
          href={`${basePath}?view=all-notes`}
          className={
            'slm-chip' + (scopeKind === 'all-notes' ? ' is-active' : '')
          }
        >
          All notes <span className="cnt">{notesCount}</span>
        </Link>
        <Link href={`${basePath}/practice`} className="slm-chip">
          <span className="ico" aria-hidden="true">
            🎯
          </span>
          My practice
        </Link>
        <Link
          href={`${basePath}?view=bookmarked`}
          className={
            'slm-chip' + (scopeKind === 'bookmarked' ? ' is-active' : '')
          }
        >
          Bookmarked
          {bookmarkCount != null && <span className="cnt">{bookmarkCount}</span>}
        </Link>
      </nav>

      {sheetVisible &&
        createPortal(
          <>
            <button
              type="button"
              className="slm-scrim"
              aria-label="Close browse"
              onClick={() => setSheetOpen(false)}
            />
            <div
              className="slm-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Browse the library"
            >
              <div className="slm-sheet-grab" aria-hidden="true" />
              <div className="slm-sheet-head">
                <span className="slm-sheet-title">Browse</span>
              </div>
              <div className="slm-sheet-list">
                {sections.map((section) => (
                  <div key={section.key}>
                    <div className="slm-sheet-section">
                      <span aria-hidden="true">{section.glyph}</span>
                      {section.title}
                    </div>
                    {section.rows.map((row) =>
                      row.href ? (
                        <Link
                          key={row.key}
                          href={row.href}
                          title={row.title}
                          className={
                            'slm-sheet-row' + (row.active ? ' is-active' : '')
                          }
                          aria-current={row.active ? 'page' : undefined}
                          onClick={() => setSheetOpen(false)}
                        >
                          {row.dotColor && (
                            <span
                              className="pip"
                              style={{ background: row.dotColor }}
                              aria-hidden="true"
                            />
                          )}
                          <span className="label">{row.label}</span>
                          {row.count != null && (
                            <span className="cnt">{row.count}</span>
                          )}
                        </Link>
                      ) : (
                        <div
                          key={row.key}
                          className="slm-sheet-row is-disabled"
                          title={row.hint}
                        >
                          <span className="label">{row.label}</span>
                          {row.hint && <span className="hint">soon</span>}
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
