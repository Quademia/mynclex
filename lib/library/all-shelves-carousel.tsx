// mynclex/lib/library/all-shelves-carousel.tsx
//
// All Shelves view — Spotify-style horizontal carousels, one per
// shelf. Mounted at the `?shelf=all` main pane (and any other
// `?shelf=…` URL, since 11.3a routes everything to the same
// landing pane until 11.4 ships shelf-detail).
//
// Per shelf:
//   • Strip head — coloured square dot + title (Link to ?shelf=<id>
//     — gains a real destination in 11.4) + count + tagline.
//   • Strip body — horizontal-scrolling row of note cards. Each
//     card has the shelf's accent colour as a left-edge bar; head
//     row carries the Pub/Draft pill; body shows title + desc
//     fallback (description, else subtitle, else nothing); chip
//     row at the bottom carries up to 2 pillar chips.
//   • Trailing tile — dashed `+ Add to shelf` opens the picker.
//
// Carousel cards expose a hover-revealed ✕ button that opens a
// confirm dialog → removeNoteFromShelfAction.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ErrorToast } from '@/lib/toast/error-toast';
import { AddNotesToShelfModal } from './add-notes-to-shelf-modal';
import { removeNoteFromShelfAction } from './actions';
import type {
  LibraryEligibleNote,
  LibraryShelfCardNote,
  LibraryShelfWithCount,
  LibraryShelfWithNotes,
} from './types';

interface AllShelvesCarouselProps {
  shelves: LibraryShelfWithNotes[];
  /** Folders for the AddNotesToShelfModal's folder-filter dropdown. */
  folders: Array<{ folder_id: string; name: string }>;
  /**
   * Eligible-notes lookup by shelf_id. Pre-fetched server-side so
   * opening the dialog is instant (no extra round trip). Re-fetched
   * on every route refresh — fresh after each attach.
   */
  eligibleByShelf: Record<string, LibraryEligibleNote[]>;
  onNewShelf: () => void;
}

export function AllShelvesCarousel({
  shelves,
  folders,
  eligibleByShelf,
  onNewShelf,
}: AllShelvesCarouselProps) {
  // Picker + remove state — one of each open at a time across the
  // whole carousel (popovers + modals are mutually exclusive).
  const [addingTo, setAddingTo] = useState<LibraryShelfWithCount | null>(null);
  const [removing, setRemoving] = useState<{
    shelf: LibraryShelfWithNotes;
    note: LibraryShelfCardNote;
  } | null>(null);

  return (
    <div className="lib-all-shelves">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <span>Library</span>
            <span className="sep">/</span>
            <span className="b">All shelves</span>
          </div>
          <h1 className="lib-pane-title">All shelves</h1>
          <p className="lib-pane-sub">
            Curated cross-cutting packs. Each shelf carries its own
            identity colour wherever it appears.
          </p>
        </div>
        <button
          className="lib-btn lib-btn-primary"
          type="button"
          onClick={onNewShelf}
        >
          + New shelf
        </button>
      </header>

      <div className="lib-shelf-carousels">
        {shelves.map((shelf) => (
          <section key={shelf.shelf_id} className="lib-shelf-strip-wrap">
            <header className="lib-shelf-strip-head">
              <span
                className="lib-shelf-strip-dot"
                style={{ background: shelf.color }}
                aria-hidden="true"
              />
              <Link
                href={`/tutor/library?shelf=${shelf.shelf_id}`}
                className="lib-shelf-strip-title"
              >
                {shelf.title}
              </Link>
              <span className="lib-shelf-strip-count">
                {shelf.notes.length} note{shelf.notes.length === 1 ? '' : 's'}
              </span>
              {shelf.tagline && (
                <span className="lib-shelf-strip-tagline">{shelf.tagline}</span>
              )}
            </header>
            <div className="lib-shelf-strip">
              {shelf.notes.map((note) => (
                <CarouselCard
                  key={note.note_id}
                  note={note}
                  shelfColor={shelf.color}
                  onOpen={() => {
                    // 11.3a/b — clicking a card routes to the editor.
                    // The Link inside the card handles this; the ✕
                    // button has its own click-stop.
                  }}
                  onRemove={() => setRemoving({ shelf, note })}
                />
              ))}
              <button
                type="button"
                className="lib-shelf-card lib-shelf-card-add"
                onClick={() => setAddingTo(shelf)}
              >
                <span className="lib-shelf-card-add-plus" aria-hidden="true">
                  +
                </span>
                <span>Add to shelf</span>
              </button>
            </div>
          </section>
        ))}
      </div>

      {addingTo && (
        <AddNotesToShelfModal
          shelf={addingTo}
          folders={folders}
          eligibleNotes={eligibleByShelf[addingTo.shelf_id] ?? []}
          onClose={() => setAddingTo(null)}
        />
      )}

      {removing && (
        <RemoveFromShelfConfirm
          shelfTitle={removing.shelf.title}
          shelfId={removing.shelf.shelf_id}
          note={removing.note}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}


interface CarouselCardProps {
  note: LibraryShelfCardNote;
  shelfColor: string;
  onOpen: () => void;
  onRemove: () => void;
}

function CarouselCard({ note, shelfColor, onOpen, onRemove }: CarouselCardProps) {
  void onOpen; // navigation handled by inner <Link>
  // The card body is a Link to the editor; the ✕ stops the click
  // from propagating to the Link. This mirrors the cohort-card
  // overlay-link pattern used elsewhere in the product.
  const fallbackDesc = note.description ?? note.subtitle ?? '';

  return (
    <div
      className="lib-shelf-card"
      style={
        { '--shelf-accent': shelfColor } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="lib-shelf-card-remove"
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
      <Link
        href={`/tutor/library/note/${note.note_id}`}
        className="lib-shelf-card-link"
      >
        <div className="lib-shelf-card-head">
          <span
            className={`lib-shelf-card-pill lib-shelf-card-pill-${note.is_published ? 'pub' : 'draft'}`}
          >
            {note.is_published ? 'Pub' : 'Draft'}
          </span>
        </div>
        <div className="lib-shelf-card-title">{note.title}</div>
        {fallbackDesc && (
          <div className="lib-shelf-card-desc">{fallbackDesc}</div>
        )}
        {note.pillars.length > 0 && (
          <div className="lib-shelf-card-chips">
            {note.pillars.slice(0, 2).map((p) => (
              <span key={p} className="lib-shelf-card-chip" title={p}>
                {shortPillar(p)}
              </span>
            ))}
          </div>
        )}
      </Link>
    </div>
  );
}


/**
 * Truncate a long NCSBN pillar name to a 2-word compact form for
 * the carousel chip row. Matches the CD prototype's
 * `p.name.split(' ').slice(0, 2).join(' ')` rule. Tooltip carries
 * the full name.
 */
function shortPillar(name: string): string {
  return name.split(' ').slice(0, 2).join(' ');
}


interface RemoveFromShelfConfirmProps {
  shelfTitle: string;
  shelfId: string;
  note: LibraryShelfCardNote;
  onClose: () => void;
}

function RemoveFromShelfConfirm({
  shelfTitle,
  shelfId,
  note,
  onClose,
}: RemoveFromShelfConfirmProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    setPending(true);
    setError(null);
    const result = await removeNoteFromShelfAction(shelfId, note.note_id);
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
        aria-label={`Remove ${note.title} from ${shelfTitle}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) onClose();
        }}
      >
        <div className="prog-modal lib-modal-remove-from-shelf">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Remove from shelf?</h2>
          </header>
          <div className="prog-modal-body">
            <p>
              Remove <b>{note.title}</b> from <b>{shelfTitle}</b>?
            </p>
            <p className="lib-modal-sub">
              The note itself stays put — it keeps its folder, pillars,
              tags and any other shelves it&apos;s on. Only the
              membership on this shelf goes.
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
              onClick={handleRemove}
              disabled={pending}
            >
              {pending ? 'Removing…' : 'Remove'}
            </button>
          </footer>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
