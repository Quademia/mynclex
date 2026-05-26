// mynclex/lib/library/shelf-detail.tsx
//
// Per-shelf detail view (slice 11.4). Mounted at the main pane when
// `?shelf=<uuid>` matches a real shelf the tutor owns.
//
// Layout:
//   • Header — crumb (Library / Shelves / <title>) + title row with
//     the shelf's identity dot + `Shelf · curated` lens badge + a
//     sub-line composed of count + tagline + description + the
//     primary `+ Add notes` button on the right.
//   • Numbered notes list — each row is the lens-row shape from the
//     planning doc: title (+ subtitle), description fallback,
//     inline meta (📁 folder · 📚 other-shelf pip · pillars · tags),
//     Pub/Draft pill on the right, plus per-row up/down arrows and
//     a hover-revealed ✕ to remove from the shelf.
//   • Empty state — when the shelf has 0 members.
//
// All row chrome (arrows, ✕) stops click propagation so the row's
// outer Link to the note editor doesn't fire on click of those
// affordances. Reuses 11.3b's AddNotesToShelfModal +
// RemoveFromShelfConfirm.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { AddNotesToShelfModal } from './add-notes-to-shelf-modal';
import { RemoveFromShelfConfirm } from './remove-from-shelf-confirm';
import { reorderShelfMemberAction } from './actions';
import { lensRowFallback, pillarShortName } from './format';
import type {
  LibraryEligibleNote,
  LibraryShelfDetail,
  LibraryShelfDetailNote,
  LibraryShelfWithCount,
} from './types';

interface ShelfDetailProps {
  shelf: LibraryShelfDetail;
  /** For the AddNotesToShelfModal's folder-filter dropdown. */
  folders: Array<{ folder_id: string; name: string }>;
  /**
   * Eligibles for THIS shelf — pre-fetched so the picker opens
   * instantly. Empty array when the shelf already covers every
   * eligible note (or when there are none).
   */
  eligibles: LibraryEligibleNote[];
}

export function ShelfDetail({ shelf, folders, eligibles }: ShelfDetailProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] =
    useState<LibraryShelfDetailNote | null>(null);

  // AddNotesToShelfModal takes the lean LibraryShelfWithCount shape —
  // strip the heavy `notes` array from the detail projection so the
  // modal's prop type matches.
  const leanShelf: LibraryShelfWithCount = {
    shelf_id: shelf.shelf_id,
    tutor_id: shelf.tutor_id,
    title: shelf.title,
    tagline: shelf.tagline,
    description: shelf.description,
    color: shelf.color,
    position: shelf.position,
    created_at: shelf.created_at,
    updated_at: shelf.updated_at,
    note_count: shelf.note_count,
  };

  return (
    <div className="lib-shelf-detail">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <Link
              href="/tutor/library?shelf=all"
              className="lib-pane-crumb-link"
            >
              Shelves
            </Link>
            <span className="sep">/</span>
            <span className="b">{shelf.title}</span>
          </div>
          <div className="lib-shelf-detail-title-row">
            <span
              className="lib-shelf-detail-dot"
              style={{ background: shelf.color }}
              aria-hidden="true"
            />
            <h1 className="lib-pane-title">{shelf.title}</h1>
            <span className="lib-shelf-detail-badge">Shelf · curated</span>
          </div>
          <p className="lib-pane-sub">
            <span>
              {shelf.note_count} note{shelf.note_count === 1 ? '' : 's'}
            </span>
            {shelf.tagline && (
              <>
                <span className="lib-pane-sub-sep" aria-hidden="true">
                  ·
                </span>
                <span className="lib-shelf-detail-tagline">{shelf.tagline}</span>
              </>
            )}
          </p>
          {shelf.description && (
            <p className="lib-shelf-detail-desc">{shelf.description}</p>
          )}
        </div>
        <button
          type="button"
          className="lib-btn lib-btn-primary"
          onClick={() => setAdding(true)}
        >
          + Add notes
        </button>
      </header>

      {shelf.notes.length === 0 ? (
        <ShelfEmpty onAdd={() => setAdding(true)} />
      ) : (
        <ol className="lib-shelf-detail-list">
          {shelf.notes.map((note, idx) => (
            <ShelfNoteRow
              key={note.note_id}
              note={note}
              ordinal={idx + 1}
              isFirst={idx === 0}
              isLast={idx === shelf.notes.length - 1}
              shelfId={shelf.shelf_id}
              shelfColor={shelf.color}
              onRemove={() => setRemoving(note)}
            />
          ))}
        </ol>
      )}

      {adding && (
        <AddNotesToShelfModal
          shelf={leanShelf}
          folders={folders}
          eligibleNotes={eligibles}
          onClose={() => setAdding(false)}
        />
      )}

      {removing && (
        <RemoveFromShelfConfirm
          shelfTitle={shelf.title}
          shelfId={shelf.shelf_id}
          note={removing}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}


interface ShelfNoteRowProps {
  note: LibraryShelfDetailNote;
  ordinal: number;
  isFirst: boolean;
  isLast: boolean;
  shelfId: string;
  shelfColor: string;
  onRemove: () => void;
}

function ShelfNoteRow({
  note,
  ordinal,
  isFirst,
  isLast,
  shelfId,
  shelfColor,
  onRemove,
}: ShelfNoteRowProps) {
  const router = useRouter();
  const [reorderPending, setReorderPending] = useState<'up' | 'down' | null>(
    null,
  );
  const [reorderError, setReorderError] = useState<string | null>(null);

  const fallbackLine = lensRowFallback(note.description, note.subtitle);

  async function handleReorder(direction: 'up' | 'down') {
    if (reorderPending) return;
    setReorderPending(direction);
    setReorderError(null);
    const result = await reorderShelfMemberAction(
      shelfId,
      note.note_id,
      direction,
    );
    if (!result.ok) {
      setReorderError(result.error);
      setReorderPending(null);
      return;
    }
    // router.refresh re-runs the server component → fresh `notes`
    // array with swapped positions.
    router.refresh();
    setReorderPending(null);
  }

  return (
    <li
      className="lib-shelf-detail-row-wrap"
      style={{ '--shelf-accent': shelfColor } as React.CSSProperties }
    >
      <Link
        href={`/tutor/library/note/${note.note_id}`}
        className="lib-shelf-detail-row"
      >
        <span className="lib-shelf-detail-num" aria-hidden="true">
          {ordinal}.
        </span>
        <div className="lib-shelf-detail-row-main">
          <div className="lib-note-title-line">
            <span className="lib-note-title">{note.title}</span>
            {note.subtitle && (
              <span className="lib-note-subtitle">{note.subtitle}</span>
            )}
          </div>
          {fallbackLine && (
            <div className="lib-note-desc">{fallbackLine}</div>
          )}
          <div className="lib-note-meta">
            {note.folder_name && (
              <span className="lib-meta-chip lib-meta-chip-folder">
                <span aria-hidden="true">📁</span> {note.folder_name}
              </span>
            )}
            {note.other_shelf_count > 0 && (
              <span
                className="lib-meta-chip lib-meta-chip-shelf"
                title={`Also on ${note.other_shelf_count} other shelf${
                  note.other_shelf_count === 1 ? '' : 'ves'
                }`}
              >
                <span aria-hidden="true">📚</span> +{note.other_shelf_count}
              </span>
            )}
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
          </div>
        </div>
        <div className="lib-shelf-detail-row-side">
          <span
            className={`lib-state-pill is-${
              note.is_published ? 'pub' : 'draft'
            }`}
          >
            {note.is_published ? 'Pub' : 'Draft'}
          </span>
        </div>
      </Link>

      <div className="lib-shelf-detail-row-tools" aria-hidden={false}>
        <button
          type="button"
          className="lib-shelf-detail-arrow"
          aria-label={`Move ${note.title} up`}
          title="Move up"
          disabled={isFirst || reorderPending != null}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleReorder('up');
          }}
        >
          ▲
        </button>
        <button
          type="button"
          className="lib-shelf-detail-arrow"
          aria-label={`Move ${note.title} down`}
          title="Move down"
          disabled={isLast || reorderPending != null}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleReorder('down');
          }}
        >
          ▼
        </button>
        <button
          type="button"
          className="lib-shelf-detail-remove"
          aria-label={`Remove ${note.title} from this shelf`}
          title="Remove from shelf"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </div>

      <ErrorToast
        error={reorderError}
        onDismiss={() => setReorderError(null)}
      />
    </li>
  );
}


function ShelfEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="lib-empty lib-empty-inline">
      <div className="lib-empty-glyph" aria-hidden="true">
        📚
      </div>
      <h2 className="lib-empty-title">No notes on this shelf yet</h2>
      <p className="lib-empty-sub">
        Shelves are curated cross-folder packs. Add notes from across
        your folders — the same note can sit on as many shelves as
        you like.
      </p>
      <div className="lib-empty-actions">
        <button
          type="button"
          className="lib-btn lib-btn-primary"
          onClick={onAdd}
        >
          + Add notes to shelf
        </button>
      </div>
    </div>
  );
}


/**
 * Stale `?shelf=<uuid>` — the id doesn't match any of the tutor's
 * shelves (or RLS filtered it out). Mirrors `FolderNotFound` in
 * `home-shell.tsx`.
 */
export function ShelfNotFound() {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        ❔
      </div>
      <h2 className="lib-empty-title">Shelf not found</h2>
      <p className="lib-empty-sub">
        That shelf doesn&apos;t exist (or isn&apos;t yours). Try a shelf
        from the sidebar.
      </p>
    </div>
  );
}
