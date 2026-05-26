// mynclex/lib/library/new-note-modal.tsx
//
// Create-note modal (slice 11.2b). Modal-first flow per the UX
// call — the tutor sets the three required fields here, the row
// is created on submit, then they're routed to the editor at
// /tutor/library/note/<id> for everything else.
//
// Three fields:
//   • Title (required, 2..120 chars)
//   • Folder dropdown (defaults to the currently-selected folder
//     in the home shell if any, else "Root (no folder)")
//   • Pillars multi-select via PillarPicker popover (≥1 required)
//
// Subtitle / description / tags / body are NOT here — they live
// in the editor route. Keeps this modal fast and the flow honest:
// you don't write the note here, you create the row and start.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createNoteAction } from './actions';
import { PillarPicker } from './pillar-picker';
import { FolderPicker } from './folder-picker';
import { pillarShortName } from './format';
import type { LibraryFolderWithCount, NclexPillar } from './types';

const TITLE_MIN = 2;
const TITLE_MAX = 120;

interface NewNoteModalProps {
  folders: LibraryFolderWithCount[];
  /** The folder currently selected in the home shell, or null. */
  defaultFolderId: string | null;
  onClose: () => void;
}

export function NewNoteModal({
  folders,
  defaultFolderId,
  onClose,
}: NewNoteModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);
  const [pillars, setPillars] = useState<NclexPillar[]>([]);

  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [pillarPickerOpen, setPillarPickerOpen] = useState(false);

  const trimmedTitle = title.trim();
  const isDirty =
    trimmedTitle.length > 0 ||
    pillars.length > 0 ||
    folderId !== defaultFolderId;

  const isTitleTooShort = trimmedTitle.length > 0 && trimmedTitle.length < TITLE_MIN;
  const isTitleTooLong = trimmedTitle.length > TITLE_MAX;
  const hasPillar = pillars.length > 0;

  const canSubmit =
    trimmedTitle.length >= TITLE_MIN &&
    !isTitleTooLong &&
    hasPillar &&
    !isPending;

  const selectedFolder = useMemo(
    () => (folderId ? folders.find((f) => f.folder_id === folderId) ?? null : null),
    [folderId, folders],
  );

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !folderPickerOpen && !pillarPickerOpen) {
        attemptClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending, folderPickerOpen, pillarPickerOpen]);

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createNoteAction({
        title: trimmedTitle,
        folder_id: folderId,
        pillars,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Modal closes implicitly when we navigate. Route to the editor
      // so the tutor can start writing immediately.
      router.push(`/tutor/library/note/${result.note_id}`);
    });
  }

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="New note"
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal lib-modal-folder">
          <header className="prog-modal-header">
            <div>
              <h2 className="prog-modal-title">New note</h2>
              <p className="lib-modal-sub">
                Set the bare minimum to create the row. Subtitle, body,
                tags and everything else live in the editor.
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
                  Title <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Acid-base balance, Furosemide deep-dive"
                  disabled={isPending}
                  autoFocus
                />
                {isTitleTooShort && (
                  <span className="lib-field-error">
                    Title must be at least {TITLE_MIN} characters.
                  </span>
                )}
                {isTitleTooLong && (
                  <span className="lib-field-error">
                    Keep it under {TITLE_MAX} characters.
                  </span>
                )}
              </label>

              <div className="prog-field">
                <span className="prog-field-label">Folder</span>
                <div className="lib-anchor">
                  <button
                    type="button"
                    className="lib-anchor-trigger"
                    onClick={() => setFolderPickerOpen((v) => !v)}
                    disabled={isPending}
                  >
                    <span className="lib-anchor-ic" aria-hidden="true">
                      {selectedFolder ? '📁' : '⌖'}
                    </span>
                    <span>
                      {selectedFolder ? selectedFolder.name : 'Root (no folder)'}
                    </span>
                    <span className="lib-anchor-chev" aria-hidden="true">▾</span>
                  </button>
                  {folderPickerOpen && (
                    <FolderPicker
                      folders={folders}
                      value={folderId}
                      onChange={setFolderId}
                      onClose={() => setFolderPickerOpen(false)}
                    />
                  )}
                </div>
              </div>

              <div className="prog-field">
                <span className="prog-field-label">
                  NCLEX pillars <span className="prog-required">*</span>
                </span>
                <div className="lib-anchor">
                  <div className="lib-meta-chips">
                    {pillars.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="lib-meta-chip is-on"
                        onClick={() =>
                          setPillars((cur) => cur.filter((x) => x !== p))
                        }
                        title={`${p} — click to remove`}
                      >
                        <span>{pillarShortName(p)}</span>
                        <span className="lib-meta-chip-x" aria-hidden="true">×</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="lib-meta-chip-add"
                      onClick={() => setPillarPickerOpen((v) => !v)}
                      disabled={isPending}
                    >
                      + {pillars.length === 0 ? 'Add pillar' : 'Add'}
                    </button>
                  </div>
                  {pillarPickerOpen && (
                    <PillarPicker
                      value={pillars}
                      onChange={setPillars}
                      onClose={() => setPillarPickerOpen(false)}
                    />
                  )}
                </div>
                {!hasPillar && (
                  <span className="prog-field-help">
                    Pick at least one NCLEX Client Needs sub-category.
                    This is how the note shows up in pillar lenses.
                  </span>
                )}
              </div>

              <div className="lib-hint">
                <span className="lib-hint-icon" aria-hidden="true">i</span>
                <div>
                  The note starts as <b>Draft</b>. Subtitle, description,
                  body and tags all live in the editor — you can also
                  reparent the folder there. Publishing (tutor-wide vs
                  programme-scoped) ships in a later slice.
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
              {isPending ? 'Creating…' : 'Create note & open editor'}
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
