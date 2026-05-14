// mynclex/lib/curriculum/viewer-modal-shell.tsx
//
// Slice 10.2 — the shared modal *frame* for modal-shaped activity
// viewers (External link now; Live session / PDF later). It owns
// only the plumbing — dimmed backdrop, centred panel, header with
// title + close ✕, Escape-to-close, click-outside-to-close. The
// content inside is each viewer's own.
//
// Deliberately NOT reusing lib/bank/atoms/modal-frame.tsx — per
// CLAUDE.md folder convention #12 that atom is curator-internal
// plumbing. This is the student-side equivalent, co-located with
// the per-type viewers it hosts.
//
// Open/close state lives on the consumer (<ActivityAction>), not
// here — same pattern as ModalFrame.

'use client';

import { useEffect } from 'react';

interface ViewerModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function ViewerModalShell({
  title,
  onClose,
  children,
}: ViewerModalShellProps) {
  // Escape closes. Click-outside is handled on the backdrop div.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="viewer-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="viewer-modal-panel">
        <header className="viewer-modal-head">
          <h2 className="viewer-modal-title">{title}</h2>
          <button
            type="button"
            className="viewer-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="viewer-modal-body">{children}</div>
      </div>
    </div>
  );
}
