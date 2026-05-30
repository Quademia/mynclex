// mynclex/lib/library/publish-dialog.tsx
//
// "Who can read this note?" dialog — the visibility step of the
// Publish flow (slice 11.10). Opened by the editor's Publish button
// AFTER the client-side alt-text preflight passes, and re-opened by
// the "Change visibility" control on an already-published note.
//
// Two audience modes:
//   • Tutor-wide (default) — every student in any of the tutor's
//     programmes. The visibility junction stays empty.
//   • Programme-scoped — a non-empty subset of the tutor's own
//     programmes, picked via the checkbox list. Writes ≥ 1 junction
//     row (atomically, in the publish RPC).
//
// The dialog owns its form state and calls `publishNoteAction`
// itself; on success it reports the new state back to the editor via
// `onPublished` and closes. Server failures surface through
// ErrorToast (including the alt-text backstop, should the client
// preflight ever be bypassed).
//
// Chrome reuses the shared `prog-modal-*` family (same as the
// folder / shelf modals) so the surface matches the rest of the app.

'use client';

import { useMemo, useState, useTransition } from 'react';
import { ErrorToast } from '@/lib/toast/error-toast';
import { publishNoteAction } from './actions';
import type {
  LibraryProgrammeOption,
  LibraryVisibilityMode,
} from './types';

export interface PublishedState {
  is_published: boolean;
  visibility_mode: LibraryVisibilityMode;
  programme_ids: string[];
}

interface PublishDialogProps {
  noteId: string;
  noteTitle: string;
  /** Whether the note is already published — varies the copy. */
  isPublished: boolean;
  /** The tutor's own programmes (checkbox list source). */
  programmes: LibraryProgrammeOption[];
  /** Current mode + scope, used to seed the form on re-scope. */
  initialMode: LibraryVisibilityMode;
  initialProgrammeIds: string[];
  onClose: () => void;
  onPublished: (state: PublishedState) => void;
}

export function PublishDialog({
  noteId,
  noteTitle,
  isPublished,
  programmes,
  initialMode,
  initialProgrammeIds,
  onClose,
  onPublished,
}: PublishDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasProgrammes = programmes.length > 0;

  // Seed from the note's current visibility. A first publish on a
  // tutor with no programmes can only be TUTOR_WIDE.
  const [mode, setMode] = useState<LibraryVisibilityMode>(
    initialMode === 'PROGRAMME_SCOPED' && hasProgrammes
      ? 'PROGRAMME_SCOPED'
      : 'TUTOR_WIDE',
  );
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(initialProgrammeIds),
  );

  function toggle(programmeId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(programmeId)) next.delete(programmeId);
      else next.add(programmeId);
      return next;
    });
  }

  const scopedButEmpty = mode === 'PROGRAMME_SCOPED' && checked.size === 0;
  const canSubmit = !isPending && !scopedButEmpty;

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const programmeIds = mode === 'PROGRAMME_SCOPED' ? Array.from(checked) : [];
    startTransition(async () => {
      const result = await publishNoteAction(noteId, mode, programmeIds);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onPublished({
        is_published: result.is_published,
        visibility_mode: result.visibility_mode,
        programme_ids: programmeIds,
      });
      onClose();
    });
  }

  const heading = isPublished ? 'Update who can read this' : 'Publish note';
  const submitLabel = isPublished
    ? isPending
      ? 'Updating…'
      : 'Update visibility'
    : isPending
      ? 'Publishing…'
      : 'Publish note';

  const scopedCount = checked.size;
  const scopedSummary = useMemo(() => {
    if (scopedCount === 0) return 'No programmes picked yet';
    return `${scopedCount} programme${scopedCount === 1 ? '' : 's'} selected`;
  }, [scopedCount]);

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isPending) onClose();
        }}
      >
        <div className="prog-modal lib-publish-modal">
          <header className="prog-modal-header">
            <div>
              <h2 className="prog-modal-title">{heading}</h2>
              <p className="lib-modal-sub">
                Choose who sees{' '}
                <b>{noteTitle || 'this note'}</b> in their library.
              </p>
            </div>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={onClose}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body">
            <section className="prog-form-section">
              {/* Tutor-wide */}
              <label
                className={
                  mode === 'TUTOR_WIDE'
                    ? 'lib-vis-option is-on'
                    : 'lib-vis-option'
                }
              >
                <input
                  type="radio"
                  name="lib-visibility"
                  checked={mode === 'TUTOR_WIDE'}
                  onChange={() => setMode('TUTOR_WIDE')}
                  disabled={isPending}
                />
                <span className="lib-vis-option-body">
                  <span className="lib-vis-option-title">Tutor-wide</span>
                  <span className="lib-vis-option-desc">
                    Every student enrolled in any of your programmes can
                    read this note.
                  </span>
                </span>
              </label>

              {/* Programme-scoped */}
              <label
                className={
                  mode === 'PROGRAMME_SCOPED'
                    ? 'lib-vis-option is-on'
                    : hasProgrammes
                      ? 'lib-vis-option'
                      : 'lib-vis-option is-disabled'
                }
              >
                <input
                  type="radio"
                  name="lib-visibility"
                  checked={mode === 'PROGRAMME_SCOPED'}
                  onChange={() => setMode('PROGRAMME_SCOPED')}
                  disabled={isPending || !hasProgrammes}
                />
                <span className="lib-vis-option-body">
                  <span className="lib-vis-option-title">
                    Programme-scoped
                  </span>
                  <span className="lib-vis-option-desc">
                    {hasProgrammes
                      ? 'Only students in the programmes you pick below.'
                      : 'You have no programmes yet — create one to scope a note to it.'}
                  </span>
                </span>
              </label>

              {/* Programme checklist — only when scoped. */}
              {mode === 'PROGRAMME_SCOPED' && hasProgrammes && (
                <div className="lib-vis-progs">
                  <div className="lib-vis-progs-head">
                    <span className="prog-field-label">Programmes</span>
                    <span className="lib-vis-progs-count">{scopedSummary}</span>
                  </div>
                  <ul className="lib-vis-prog-list">
                    {programmes.map((p) => (
                      <li key={p.programme_id}>
                        <label className="lib-vis-prog-row">
                          <input
                            type="checkbox"
                            checked={checked.has(p.programme_id)}
                            onChange={() => toggle(p.programme_id)}
                            disabled={isPending}
                          />
                          <span className="lib-vis-prog-title">{p.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {scopedButEmpty && (
                    <span className="lib-field-error">
                      Pick at least one programme, or choose Tutor-wide.
                    </span>
                  )}
                </div>
              )}

              <div className="lib-hint">
                <span className="lib-hint-icon" aria-hidden="true">
                  i
                </span>
                <div>
                  Visibility is per-note. Folders, shelves, pillars and
                  tags are organisational only — they never change who
                  can see a note. You can change this anytime.
                </div>
              </div>
            </section>
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={onClose}
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
              {submitLabel}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
