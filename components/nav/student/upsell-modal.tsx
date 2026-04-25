// mynclex/components/nav/student/upsell-modal.tsx
//
// Marketing-nudge modal shown when a bank-only student clicks the
// Programme pill. "Browse programmes" routes to the public /programmes
// listing — placeholder for now, real listing lands with the tutored-
// enrolment build.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function ProgrammeUpsellModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  // Close on Escape so the modal feels native.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upsell-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-icon" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <span className="modal-title" id="upsell-modal-title">
            No programme yet
          </span>
        </div>
        <div className="modal-body">
          Tutor programmes add week-by-week structure and live sessions
          on top of your bank access. Browse available programmes to
          enrol.
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Not now
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onClose();
              router.push('/programmes');
            }}
          >
            Browse programmes
          </button>
        </div>
      </div>
    </div>
  );
}
