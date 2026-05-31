// mynclex/lib/library/folder-rows.tsx
//
// Folder lens body for the tutor library sidebar.
//
// Slice 11.2a shipped the read-only row + the "All folders" header.
// Slice 11.4 follow-on adds a per-row hover-revealed kebab ⋮ menu
// with Edit + Delete entries — mirrors ShelfRows so the two lenses
// feel identical.
//
// Selection state is URL-driven: `?folder=<uuid>` for a specific
// folder, `?folder=all` for the All-folders grid. We use Next's
// <Link> components so clicks behave like real navigation
// (browser-back, middle-click open-in-new-tab, etc.) — no
// client-side state for selection.

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { NewFolderModal } from './new-folder-modal';
import { DeleteFolderConfirm } from './delete-folder-confirm';
import { usePopoverPosition } from './use-popover-position';
import type { LibraryFolder, LibraryFolderWithCount } from './types';

interface FolderRowsProps {
  folders: LibraryFolderWithCount[];
  /** The currently-selected ?folder= value, or null when unset. */
  selected: string | null;
}

export function FolderRows({ folders, selected }: FolderRowsProps) {
  const totalFolders = folders.length;
  const allActive = selected === 'all';

  // One modal/confirm open at a time across the whole lens.
  const [editing, setEditing] = useState<LibraryFolder | null>(null);
  const [deleting, setDeleting] = useState<LibraryFolderWithCount | null>(null);

  return (
    <>
      <Link
        href="/tutor/library?folder=all"
        className={`lens-item${allActive ? ' is-active' : ''}`}
        aria-current={allActive ? 'page' : undefined}
      >
        <span className="label">All folders</span>
        <span className="cnt">{totalFolders}</span>
      </Link>

      {folders.length === 0 ? (
        <div className="lens-empty">
          No folders yet — create one with + New folder.
        </div>
      ) : (
        // Per-folder rows scroll within a capped region; the "All
        // folders" anchor above stays pinned (slice 11.16c-3).
        <div className="lens-scroll">
          {folders.map((f) => (
            <FolderRow
              key={f.folder_id}
              folder={f}
              isActive={selected === f.folder_id}
              onEdit={() => setEditing(f)}
              onDelete={() => setDeleting(f)}
            />
          ))}
        </div>
      )}

      {editing && (
        <NewFolderModal
          existingFolders={folders}
          variant={{ mode: 'edit', folder: editing }}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <DeleteFolderConfirm
          folder={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}


interface FolderRowProps {
  folder: LibraryFolderWithCount;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function FolderRow({ folder, isActive, onEdit, onDelete }: FolderRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const kebabRef = useRef<HTMLButtonElement | null>(null);

  // Fixed-position the menu off the kebab's rect so it escapes the
  // lens-scroll container's clipping (slice 11.16c-3).
  const menuPos = usePopoverPosition({
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
        href={`/tutor/library?folder=${folder.folder_id}`}
        className={`lens-item${isActive ? ' is-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        title={folder.description ?? undefined}
      >
        <span className="label">{folder.name}</span>
        <span className="cnt">{folder.note_count}</span>
      </Link>
      <button
        type="button"
        ref={kebabRef}
        className="lens-item-kebab"
        aria-label={`Folder actions for ${folder.name}`}
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
          ref={menuPos.ref}
          style={{ ...menuPos.style, right: 'auto' }}
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
