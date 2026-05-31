// mynclex/lib/library/shelf-rows.tsx
//
// Shelf lens body for the tutor library sidebar (slice 11.3a,
// rewired in 11.4).
//
// Parallels `folder-rows.tsx` from 11.2a, with two shelf-specific
// additions:
//   • A coloured square dot to the left of each shelf title (carries
//     the shelf's identity colour, matching the rail-dot pattern in
//     the CD prototype's `shell.jsx`).
//   • A per-row kebab menu (⋮) with Edit + Delete entries — the
//     minimal CRUD surface a tutor needs to clean up test shelves
//     while building the library.
//
// Routing — slice 11.4 makes per-shelf URLs real. Each shelf row's
// link points at `?shelf=<shelf_id>` and lights up as active when
// the URL matches; `All shelves` continues to point at `?shelf=all`
// (which renders the Spotify-style carousel).

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { NewShelfModal } from './new-shelf-modal';
import { DeleteShelfConfirm } from './delete-shelf-confirm';
import { usePopoverPosition } from './use-popover-position';
import type { LibraryShelfWithCount, LibraryShelf } from './types';

interface ShelfRowsProps {
  shelves: LibraryShelfWithCount[];
  /** The currently-selected ?shelf= value, or null when unset. */
  selected: string | null;
}

export function ShelfRows({ shelves, selected }: ShelfRowsProps) {
  const totalShelves = shelves.length;
  const allActive = selected === 'all';

  // Two modal/menu states live at the rows-level, not per-row, so we
  // only ever have one open at a time (popovers + modals are mutually
  // exclusive).
  const [editing, setEditing] = useState<LibraryShelf | null>(null);
  const [deleting, setDeleting] = useState<LibraryShelf | null>(null);

  return (
    <>
      <Link
        href="/tutor/library?shelf=all"
        className={`lens-item${allActive ? ' is-active' : ''}`}
        aria-current={allActive ? 'page' : undefined}
      >
        <span className="label">All shelves</span>
        <span className="cnt">{totalShelves}</span>
      </Link>

      {shelves.length === 0 ? (
        <div className="lens-empty">
          No shelves yet — create one with + New shelf.
        </div>
      ) : (
        // Per-shelf rows scroll within a capped region; the "All
        // shelves" anchor above stays pinned (slice 11.16c-3).
        <div className="lens-scroll">
          {shelves.map((s) => (
            <ShelfRow
              key={s.shelf_id}
              shelf={s}
              href={`/tutor/library?shelf=${s.shelf_id}`}
              isActive={selected === s.shelf_id}
              onEdit={() => setEditing(s)}
              onDelete={() => setDeleting(s)}
            />
          ))}
        </div>
      )}

      {editing && (
        <NewShelfModal
          existingShelves={shelves}
          variant={{ mode: 'edit', shelf: editing }}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <DeleteShelfConfirm
          shelf={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}


interface ShelfRowProps {
  shelf: LibraryShelfWithCount;
  href: string;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function ShelfRow({ shelf, href, isActive, onEdit, onDelete }: ShelfRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const kebabRef = useRef<HTMLButtonElement | null>(null);

  // Fixed-position the menu off the kebab's rect so it escapes the
  // lens-scroll container's clipping (slice 11.16c-3).
  const { ref: menuRef, style: menuStyle } = usePopoverPosition({
    getAnchorRect: () => kebabRef.current?.getBoundingClientRect() ?? null,
    gap: 4,
  });

  // Click-outside + Escape close.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!rowRef.current) return;
      if (!rowRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="lens-item-wrap" ref={rowRef}>
      <Link
        href={href}
        className={`lens-item lens-item-shelf${isActive ? ' is-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        title={shelf.tagline ?? shelf.description ?? undefined}
      >
        <span
          className="lens-shelf-dot"
          style={{ background: shelf.color }}
          aria-hidden="true"
        />
        <span className="label">{shelf.title}</span>
        <span className="cnt">{shelf.note_count}</span>
      </Link>
      <button
        type="button"
        ref={kebabRef}
        className="lens-item-kebab"
        aria-label={`Shelf actions for ${shelf.title}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
      >
        ⋮
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          style={{ ...menuStyle, right: 'auto' }}
          className="lens-item-menu"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="lens-item-menu-btn"
            onClick={() => {
              setMenuOpen(false);
              onEdit();
            }}
          >
            ✎ Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="lens-item-menu-btn lens-item-menu-btn-danger"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );
}


