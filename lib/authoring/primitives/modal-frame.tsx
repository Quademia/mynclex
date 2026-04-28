// mynclex/lib/authoring/primitives/modal-frame.tsx
//
// Shared modal chrome — topbar (title + ID pill + status pill +
// Cancel / Save / Publish / ×) plus the body slot. Owned by every
// editor's standalone host (StandaloneQuestionModal, CaseStudyModal,
// TrendModal — the latter two land in slices 12–13).
//
// Save and Publish are wired from the host. Slice 1 ships with both
// disabled — the props default to disabled and the host opts in
// later.

'use client';

import type { ReactNode } from 'react';

export interface ModalFrameProps {
  title: string;
  itemId?: string | null;
  isPublished?: boolean;
  onCancel: () => void;
  onClose: () => void;
  saveDisabled?: boolean;
  saveDisabledReason?: string;
  publishDisabled?: boolean;
  publishDisabledReason?: string;
  onSave?: () => void;
  onPublish?: () => void;
  children: ReactNode;
}

export function ModalFrame({
  title,
  itemId,
  isPublished,
  onCancel,
  onClose,
  saveDisabled = true,
  saveDisabledReason,
  publishDisabled = true,
  publishDisabledReason,
  onSave,
  onPublish,
  children,
}: ModalFrameProps) {
  return (
    <div className="aut-modal">
      <div className="aut-modal-topbar">
        <div className="aut-modal-title-group">
          <span className="aut-modal-title">{title}</span>
          {itemId && <span className="aut-modal-id-pill">{itemId}</span>}
          {itemId && (
            <span
              className={`aut-modal-status-pill ${
                isPublished ? 'is-published' : 'is-draft'
              }`}
            >
              {isPublished ? 'Published' : 'Draft'}
            </span>
          )}
        </div>
        <div className="aut-modal-actions">
          <button type="button" className="aut-modal-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="aut-modal-save"
            disabled={saveDisabled}
            title={saveDisabledReason}
            onClick={onSave}
          >
            Save
          </button>
          <button
            type="button"
            className="aut-modal-publish"
            disabled={publishDisabled}
            title={publishDisabledReason}
            onClick={onPublish}
          >
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
          <button
            type="button"
            className="aut-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>
      <div className="aut-modal-body">{children}</div>
    </div>
  );
}
