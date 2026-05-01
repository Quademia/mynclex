// mynclex/lib/bank/atoms/modal-frame.tsx
//
// Modal chrome used as the default host for each editor. Header has
// a title, an actions slot (where <EditorActions> normally lives),
// and a close button. Body slot is scrollable.
//
// Slice 1 — read-only: editors render this around their bodies.
// Open/close state lives on the consumer (no internal state here).

'use client';

import { useEffect } from 'react';

interface ModalFrameProps {
  title: string;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

export function ModalFrame({ title, actions, onClose, children }: ModalFrameProps) {
  // Close on Escape — basic accessibility default. Click-on-backdrop
  // also closes (handled below on the overlay div).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="auth-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-modal">
        <header className="auth-modal-header">
          <h2 className="auth-modal-title">{title}</h2>
          <div className="auth-modal-header-actions">
            {actions}
            <button
              type="button"
              className="auth-modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>
        <div className="auth-modal-body">{children}</div>
      </div>
    </div>
  );
}
