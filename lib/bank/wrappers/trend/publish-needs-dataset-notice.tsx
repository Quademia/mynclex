// mynclex/lib/bank/wrappers/trend/publish-needs-dataset-notice.tsx
//
// Shown when the curator tries to publish a trend QUESTION while its
// dataset is still a draft. This is the mirror image of the case-study
// publish gate: a case publishes its children; a trend question depends
// on its dataset. A trend question only reaches students when the
// question AND its dataset are both published (the student-builder
// eligibility rule joins through td.is_published), so publishing the
// question alone would leave it silently invisible.
//
// We offer to publish the dataset alongside the question in one step.
// The curator opts in explicitly. Cancel leaves the question unsaved
// (they can untick Published and save it as a draft, which is always
// allowed). Backdrop click and Esc map to Cancel (per CLAUDE.md
// § UI Conventions). Reuses the CS dialog chrome.

'use client';

import { useEffect } from 'react';

interface Props {
  pending:          boolean;
  onCancel:         () => void;
  onPublishDataset: () => void;
}

export function PublishNeedsDatasetNotice({ pending, onCancel, onPublishDataset }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="auth-cs-delete-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="auth-cs-delete-dialog" role="dialog" aria-label="Publish trend question">
        <h3 className="auth-cs-delete-title">Publish the dataset first?</h3>
        <p className="auth-cs-delete-body">
          This question sits on a trend dataset that’s still a draft. A trend question
          can’t reach students until its dataset is published too — published on its own,
          it would stay invisible.
        </p>
        <p className="auth-cs-delete-body">
          Publish the dataset now and publish this question together?
        </p>
        <div className="auth-cs-delete-actions">
          <button
            type="button"
            className="auth-cs-btn subtle"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="auth-cs-btn primary"
            onClick={onPublishDataset}
            disabled={pending}
          >
            {pending ? 'Publishing…' : 'Publish dataset & question'}
          </button>
        </div>
      </div>
    </div>
  );
}
