// mynclex/lib/bank/wrappers/case-study/validation-panel.tsx
//
// Slice 12c-4a — floating validation panel for the case-study
// wrapper. Anchored top-right of the viewport (out of the way of
// the wrapper-edit pane's scrollable content but still visible).
// Errors first, warnings second; click × or Esc to dismiss.
//
// Pure presentation — rules + summary come from validation.ts;
// wrapper-page.tsx assembles the snapshot, calls validateCase(),
// and passes the resulting issue list + isPublished flag here.

'use client';

import { useEffect } from 'react';
import type { ValidationIssue } from './validation';
import { summarise } from './validation';

interface ValidationPanelProps {
  issues:      ValidationIssue[];
  isPublished: boolean;
  onClose:     () => void;
}

export function ValidationPanel({ issues, isPublished, onClose }: ValidationPanelProps) {
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

  const summary = summarise(issues, isPublished);
  const errors  = issues.filter((i) => i.severity === 'error');
  const warns   = issues.filter((i) => i.severity === 'warning');

  return (
    <div
      className={`auth-cs-validate-panel auth-cs-validate-panel--${summary.kind}`}
      role="dialog"
      aria-label="Validation results"
    >
      <div className="auth-cs-validate-panel-head">
        <span className="auth-cs-validate-panel-title">{summary.text}</span>
        <button
          type="button"
          className="auth-cs-validate-panel-close"
          aria-label="Close validation panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {errors.length === 0 && warns.length === 0 ? (
        <div className="auth-cs-validate-panel-empty">
          No issues found. {isPublished ? 'Ready to ship.' : 'You can publish anytime.'}
        </div>
      ) : (
        <div className="auth-cs-validate-panel-body">
          {errors.length > 0 && (
            <section>
              <h4 className="auth-cs-validate-section-head auth-cs-validate-section-head--error">
                Errors ({errors.length})
              </h4>
              <ul className="auth-cs-validate-list">
                {errors.map((iss) => (
                  <li key={iss.id} className="auth-cs-validate-item auth-cs-validate-item--error">
                    {iss.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {warns.length > 0 && (
            <section>
              <h4 className="auth-cs-validate-section-head auth-cs-validate-section-head--warn">
                Warnings ({warns.length})
              </h4>
              <ul className="auth-cs-validate-list">
                {warns.map((iss) => (
                  <li key={iss.id} className="auth-cs-validate-item auth-cs-validate-item--warn">
                    {iss.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
