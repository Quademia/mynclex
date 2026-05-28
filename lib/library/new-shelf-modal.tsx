// mynclex/lib/library/new-shelf-modal.tsx
//
// Create / edit modal for tutor library shelves (slice 11.3a).
// Same prog-modal-* / lib-modal-* chrome as the folder + note
// modals. Three text fields + an identity-colour picker.
//
// Modes (discriminated union):
//   • { mode: 'create' }                       — blank form, smart-
//                                                default colour, submit
//                                                button reads "Create
//                                                shelf".
//   • { mode: 'edit', shelf: LibraryShelf }    — pre-populated form,
//                                                submit button reads
//                                                "Save changes", gated
//                                                on dirty state.
//
// The CD prototype's `NewShelfDialog` (in
// `tutor-library/note-editor.jsx`) bundles a multi-select note-picker
// into the same modal. We defer that to slice 11.3b alongside the
// All Shelves carousel's `+ Add to shelf` flow — keeps 11.3a focused
// on the shelf entity itself.
//
// Colour picker uses the eight-swatch SHELF_PALETTE from `types.ts`.
// The smart-default in create mode picks the first palette colour
// not already used by an existing shelf, falling back to the first
// swatch when the tutor's library has > 8 shelves.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  createShelfAction,
  editShelfAction,
  type CreateShelfResult,
  type EditShelfResult,
} from './actions';
import {
  SHELF_PALETTE,
  type LibraryShelf,
  type LibraryShelfWithCount,
} from './types';

const TITLE_MIN = 2;
const TITLE_MAX = 60;
const TAGLINE_MAX = 120;
const DESC_MAX = 600;

type Mode =
  | { mode: 'create' }
  | { mode: 'edit'; shelf: LibraryShelf };

interface NewShelfModalProps {
  /** Existing shelves — used for dup-check + smart-default colour. */
  existingShelves: LibraryShelfWithCount[];
  /** Discriminated mode. */
  variant: Mode;
  onClose: () => void;
}

export function NewShelfModal({
  existingShelves,
  variant,
  onClose,
}: NewShelfModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  // Smart-default colour: first palette entry whose hex isn't already
  // worn by another shelf. With > 8 shelves it falls back to entry 0.
  // Recomputed once at mount; the user's manual picks override this.
  const initialColor = useMemo(() => {
    if (variant.mode === 'edit') return variant.shelf.color;
    const used = new Set(existingShelves.map((s) => s.color));
    const firstFree = SHELF_PALETTE.find((p) => !used.has(p.color));
    return (firstFree ?? SHELF_PALETTE[0]).color;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState(
    variant.mode === 'edit' ? variant.shelf.title : '',
  );
  const [tagline, setTagline] = useState(
    variant.mode === 'edit' ? variant.shelf.tagline ?? '' : '',
  );
  const [description, setDescription] = useState(
    variant.mode === 'edit' ? variant.shelf.description ?? '' : '',
  );
  const [color, setColor] = useState(initialColor);

  const trimmedTitle = title.trim();

  // Case-insensitive dup-check against existing shelves, excluding the
  // one being edited (renaming to the same casing is allowed).
  const otherShelfTitles = useMemo(() => {
    const skipId = variant.mode === 'edit' ? variant.shelf.shelf_id : null;
    return new Set(
      existingShelves
        .filter((s) => s.shelf_id !== skipId)
        .map((s) => s.title.toLowerCase()),
    );
  }, [existingShelves, variant]);
  const isDuplicate =
    trimmedTitle.length > 0 &&
    otherShelfTitles.has(trimmedTitle.toLowerCase());
  const isTooShort =
    trimmedTitle.length > 0 && trimmedTitle.length < TITLE_MIN;
  const isTooLong = trimmedTitle.length > TITLE_MAX;
  const isTaglineTooLong = tagline.length > TAGLINE_MAX;
  const isDescTooLong = description.length > DESC_MAX;

  // Dirty = anything differs from the starting state. In create mode
  // that's "any field has content"; in edit mode, "any field changed
  // from the loaded shelf".
  const isDirty = useMemo(() => {
    if (variant.mode === 'create') {
      return (
        trimmedTitle.length > 0 ||
        tagline.trim().length > 0 ||
        description.trim().length > 0 ||
        color !== initialColor
      );
    }
    const s = variant.shelf;
    return (
      trimmedTitle !== s.title.trim() ||
      (tagline.trim() || null) !== (s.tagline ?? null) ||
      (description.trim() || null) !== (s.description ?? null) ||
      color !== s.color
    );
  }, [variant, trimmedTitle, tagline, description, color, initialColor]);

  const canSubmit =
    trimmedTitle.length >= TITLE_MIN &&
    !isTooLong &&
    !isDuplicate &&
    !isTaglineTooLong &&
    !isDescTooLong &&
    !isPending &&
    (variant.mode === 'create' || isDirty);

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending]);

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);

    const payload = {
      title: trimmedTitle,
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      color,
    };

    startTransition(async () => {
      const result: CreateShelfResult | EditShelfResult =
        variant.mode === 'create'
          ? await createShelfAction(payload)
          : await editShelfAction(variant.shelf.shelf_id, payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const headingText = variant.mode === 'create' ? 'New shelf' : 'Edit shelf';
  const submitText =
    variant.mode === 'create'
      ? isPending
        ? 'Creating…'
        : 'Create shelf'
      : isPending
        ? 'Saving…'
        : 'Save changes';

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={headingText}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal lib-modal-shelf">
          <header className="prog-modal-header">
            <div>
              <h2 className="prog-modal-title">{headingText}</h2>
              <p className="lib-modal-sub">
                Curated cross-cutting pack. Notes can sit on many shelves
                — shelves don&apos;t gate visibility; they just organise.
              </p>
            </div>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={attemptClose}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body">
            <section className="prog-form-section">
              <label className="prog-field">
                <span className="prog-field-label">
                  Shelf title <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Foundational SATA pack, Drug deep dives"
                  maxLength={TITLE_MAX + 20}
                  disabled={isPending}
                  autoFocus
                />
                {isDuplicate && (
                  <span className="lib-field-error">
                    A shelf named &ldquo;{trimmedTitle}&rdquo; already exists.
                  </span>
                )}
                {isTooShort && (
                  <span className="lib-field-error">
                    Shelf title must be at least {TITLE_MIN} characters.
                  </span>
                )}
                {isTooLong && (
                  <span className="lib-field-error">
                    Keep it under {TITLE_MAX} characters.
                  </span>
                )}
              </label>

              <label className="prog-field">
                <span className="prog-field-label">
                  Tagline{' '}
                  <span className="prog-field-optional">· optional</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder='e.g. "Every cohort gets these in Week 1."'
                  disabled={isPending}
                />
                <span className="lib-field-hint">
                  One short line shown next to the shelf name on the All
                  Shelves carousel.
                </span>
                {isTaglineTooLong && (
                  <span className="lib-field-error">
                    Tagline must be {TAGLINE_MAX} characters or fewer
                    ({tagline.length} now).
                  </span>
                )}
              </label>

              <label className="prog-field">
                <span className="prog-field-label">
                  Description{' '}
                  <span className="prog-field-optional">· optional</span>
                </span>
                <textarea
                  className="prog-input lib-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Longer description for the shelf page. Why does this pack exist? Who's it for?"
                  rows={3}
                  disabled={isPending}
                />
                {isDescTooLong && (
                  <span className="lib-field-error">
                    Description must be {DESC_MAX} characters or fewer
                    ({description.length} now).
                  </span>
                )}
              </label>

              <div className="prog-field">
                <span className="prog-field-label">Identity colour</span>
                <div className="lib-shelf-swatches" role="radiogroup" aria-label="Shelf colour">
                  {SHELF_PALETTE.map((p) => {
                    const selected = color === p.color;
                    return (
                      <button
                        key={p.color}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={p.name}
                        title={p.name}
                        onClick={() => setColor(p.color)}
                        disabled={isPending}
                        className={`lib-shelf-swatch${selected ? ' is-selected' : ''}`}
                        style={
                          {
                            background: p.color,
                            '--swatch-color': p.color,
                          } as React.CSSProperties
                        }
                      />
                    );
                  })}
                </div>
                <div className="lib-shelf-preview">
                  <span>Preview:</span>
                  <span
                    className="lib-shelf-preview-pill"
                    style={{ background: color }}
                  >
                    <span className="lib-shelf-preview-pill-dot" />
                    {trimmedTitle || 'Shelf name'}
                  </span>
                  <span className="lib-shelf-preview-where">
                    — rail dot · per-note pip · attached-block border
                  </span>
                </div>
              </div>

              <div className="lib-hint">
                <span className="lib-hint-icon" aria-hidden="true">
                  i
                </span>
                <div>
                  <b>Shelves carry no visibility.</b> A shelf is visible to a
                  student if any of its notes are visible to them. When you
                  attach this shelf to a programme unit, a mixed-visibility
                  dialog catches any cross-cohort conflict.
                </div>
              </div>
            </section>
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={attemptClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitText}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
