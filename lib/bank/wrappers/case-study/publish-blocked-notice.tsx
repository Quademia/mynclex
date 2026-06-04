// mynclex/lib/bank/wrappers/case-study/publish-blocked-notice.tsx
//
// Shown when the curator tries to switch the case Publish toggle ON.
// Two situations, two shapes:
//
//   - kind 'incomplete' (fewer than 6 questions attached) → a plain
//     block. There's nothing to publish; the curator must add the
//     remaining questions first. Single "Got it" dismiss.
//   - kind 'drafts' (all 6 attached, but some still draft) → an OFFER.
//     A case only reaches students once every question is published, so
//     we offer to publish all 6 and take the case live in one step
//     (publishCaseWithChildrenAction). The curator opts in explicitly —
//     publishing the questions stays their choice, never automatic.
//
// Backdrop click and Esc map to the safe option — close / cancel (per
// CLAUDE.md § UI Conventions). Reuses the delete-dialog chrome.

'use client';

import { useEffect } from 'react';

export type PublishBlockKind = 'incomplete' | 'drafts';

interface Props {
  kind:          PublishBlockKind;
  count:         number;          // incomplete → questions present; drafts → drafts remaining
  pending:       boolean;
  onClose:       () => void;
  onPublishAll:  () => void;      // used only for the 'drafts' offer
}

export function PublishBlockedNotice({ kind, count, pending, onClose, onPublishAll }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isOne = count === 1;

  return (
    <div
      className="auth-cs-delete-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-cs-delete-dialog" role="dialog" aria-label="Publish case study">
        {kind === 'incomplete' ? (
          <>
            <h3 className="auth-cs-delete-title">Can’t publish yet</h3>
            <p className="auth-cs-delete-body">
              This case study has only <strong>{count}</strong> of 6 questions. A case study
              can’t be published until all 6 questions are added and published.
            </p>
            <div className="auth-cs-delete-actions">
              <button
                type="button"
                className="auth-cs-btn primary"
                onClick={onClose}
                autoFocus
              >
                Got it
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="auth-cs-delete-title">Publish the questions too?</h3>
            <p className="auth-cs-delete-body">
              <strong>{count}</strong> of the 6 questions {isOne ? 'is' : 'are'} still a draft.
              A case study only reaches students once every question inside it is published.
            </p>
            <p className="auth-cs-delete-body">
              Publish {isOne ? 'it' : 'all 6'} now and take the case live?
            </p>
            <div className="auth-cs-delete-actions">
              <button
                type="button"
                className="auth-cs-btn subtle"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="auth-cs-btn primary"
                onClick={onPublishAll}
                disabled={pending}
              >
                {pending ? 'Publishing…' : 'Publish all & publish case'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
