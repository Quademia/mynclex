// mynclex/lib/overlays/programmes/programme-archive-confirm.tsx
//
// Type-to-confirm overlay for archiving a programme. Slice 9.3e
// — ARCHIVED is terminal in v1 (no un-archive), so the type-DELETE
// gate matches the destructive-pattern convention (DeleteConfirm,
// ProgrammeLengthDecreaseConfirm).
//
// Copy notes:
//   - Surfaces the programme title so the tutor sees exactly what
//     they're retiring.
//   - Warns that active cohorts continue to their end dates —
//     archiving the programme doesn't auto-end cohorts; the cohort
//     layer carries its own lifecycle (separate slice work).
//   - "This can't be undone" because v1 has no un-archive.
//
// Re-uses the auth-delete-* class set (shared overlay styling) for
// visual parity with the other destructive confirms in this app.
//
// Self-portals to <body>. Without this, when opened from inside a
// programme card (the list ⋯ kebab) the fixed overlay is trapped in the
// card's stacking context — no backdrop dim, and sibling card content
// paints over the dialog. Portaling escapes to the top of the document,
// the same fix ProgrammeFormModal uses. Harmless for the Overview
// caller (which isn't inside a card).

'use client';

import { createPortal } from 'react-dom';

interface ProgrammeArchiveConfirmProps {
  /** Title of the programme being archived — shown in the prompt. */
  programmeTitle: string;
  /** Whether the programme is currently published (changes copy slightly). */
  isCurrentlyPublished: boolean;
  /** Tutor's typed text — confirm button is gated on this === 'DELETE'. */
  deleteText: string;
  /** True while the archive action is in flight. */
  pending?: boolean;
  /** Called when the tutor types into the confirmation input. */
  onTextChange: (text: string) => void;
  /** Called on Cancel button or backdrop click (only when not pending). */
  onCancel: () => void;
  /** Called on Confirm. Host runs the archive server action. */
  onConfirm: () => void;
}

export function ProgrammeArchiveConfirm({
  programmeTitle,
  isCurrentlyPublished,
  deleteText,
  pending = false,
  onTextChange,
  onCancel,
  onConfirm,
}: ProgrammeArchiveConfirmProps) {
  // document is always present — this only renders on a client click.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="auth-delete-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="auth-delete-confirm"
        role="alertdialog"
        aria-label="Confirm archive programme"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">
          Archive <code>{programmeTitle}</code>?
        </p>
        <p className="auth-delete-confirm-hint">
          {isCurrentlyPublished
            ? 'Active cohorts will continue to their end dates. New enrolments stop. '
            : 'This draft will be retired without ever going live. '}
          Archiving can&apos;t be undone. Type <strong>DELETE</strong> to confirm.
        </p>
        <input
          type="text"
          className="auth-input"
          value={deleteText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type DELETE"
          autoFocus
          disabled={pending}
        />
        <div className="auth-delete-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onConfirm}
            disabled={deleteText !== 'DELETE' || pending}
          >
            {pending ? 'Archiving…' : 'Confirm archive'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
