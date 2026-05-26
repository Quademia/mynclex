// mynclex/lib/library/shelf-rows.tsx
//
// Shelf lens body for the tutor library sidebar (slice 11.3a).
// Parallels `folder-rows.tsx` from 11.2a, with two shelf-specific
// additions:
//   • A coloured square dot to the left of each shelf title (carries
//     the shelf's identity colour, matching the rail-dot pattern in
//     the CD prototype's `shell.jsx`).
//   • A per-row kebab menu (⋮) with Edit + Delete entries — the
//     minimal CRUD surface a tutor needs to clean up test shelves
//     while building the library.
//
// Per the scope decision for 11.3a, clicking a shelf row navigates
// to `?shelf=all` (the All Shelves carousel placeholder). The
// per-shelf detail view ships in 11.4; until then, every shelf row
// goes to the same carousel landing rather than rendering a half-
// built shelf-scope page.

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { deleteShelfAction } from './actions';
import { NewShelfModal } from './new-shelf-modal';
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
        shelves.map((s) => (
          <ShelfRow
            key={s.shelf_id}
            shelf={s}
            // 11.3a routes every shelf row to ?shelf=all (per scope
            // decision); 11.4's shelf-detail view replaces this with
            // `?shelf=${s.shelf_id}`.
            href="/tutor/library?shelf=all"
            onEdit={() => setEditing(s)}
            onDelete={() => setDeleting(s)}
          />
        ))
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
  onEdit: () => void;
  onDelete: () => void;
}

function ShelfRow({ shelf, href, onEdit, onDelete }: ShelfRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

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
        className="lens-item lens-item-shelf"
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
        <div className="lens-item-menu" role="menu">
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


interface DeleteShelfConfirmProps {
  shelf: LibraryShelf;
  onClose: () => void;
}

/**
 * Simple yes/no destructive confirm. No type-to-confirm gate — the
 * delete is recoverable in spirit (the shelf can be recreated, and
 * notes themselves are untouched; only membership rows cascade
 * away). The DB has FK RESTRICT on `_note_attachments.shelf_id`, so
 * a shelf attached to a programme can't be deleted — the action
 * surfaces a specific error which we route through the toast.
 */
function DeleteShelfConfirm({ shelf, onClose }: DeleteShelfConfirmProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteShelfAction(shelf.shelf_id);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete shelf ${shelf.title}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) onClose();
        }}
      >
        <div className="prog-modal lib-modal-shelf-delete">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Delete shelf?</h2>
          </header>
          <div className="prog-modal-body">
            <p>
              Delete <b>{shelf.title}</b>?
            </p>
            <p className="lib-modal-sub">
              The shelf and its membership rows go. Notes that were on
              this shelf are untouched — they stay in their folders and
              keep their visibility.
            </p>
          </div>
          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-danger"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete shelf'}
            </button>
          </footer>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
