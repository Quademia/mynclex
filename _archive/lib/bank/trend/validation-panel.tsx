// mynclex/lib/bank/trend/validation-panel.tsx
//
// Slice 1.12c — dismissible floating panel that renders the output
// of validateTrend(). Anchored to the trend-editor frame in the same
// way Case Study 1.11c anchors its panel.
//
// Pure presentation:
//   - Header summary comes from summarise().
//   - Issues are rendered with errors first, warnings second (grouped
//     via array stability — the rule array already orders rules
//     severity-first within each surface-level bucket).
//   - No auto-close, no keyboard handlers beyond a close button —
//     matches 1.11c behaviour so the two panels read identically.

'use client';

import { summarise, type ValidationIssue } from './validation';

interface Props {
  issues:      ValidationIssue[];
  isPublished: boolean;
  onClose:     () => void;
}

export function ValidationPanel({ issues, isPublished, onClose }: Props) {
  const summary = summarise(issues, isPublished);
  return (
    <div
      id="tr-validate-panel"
      className="tr-validate-panel"
      role="dialog"
      aria-label="Trend dataset validation results"
    >
      <div className={`tr-validate-panel__summary is-${summary.kind}`}>
        <span>{summary.text}</span>
        <button
          type="button"
          className="tr-validate-panel__close"
          onClick={onClose}
          aria-label="Close validation panel"
        >
          ×
        </button>
      </div>
      {issues.length === 0 ? (
        <div className="tr-validate-panel__empty">
          No issues found.
        </div>
      ) : (
        <div className="tr-validate-panel__list">
          {issues.map((iss, idx) => (
            <div
              key={`${iss.id}-${idx}`}
              className={`tr-validate-panel__issue is-${iss.severity}`}
            >
              <span className="tr-validate-panel__sev">{iss.severity}</span>
              <span className="tr-validate-panel__msg">
                {iss.message}
                <code className="tr-validate-panel__rule-id">{iss.id}</code>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
