// mynclex/lib/programme-quizzes/source-hint.tsx
//
// The "Linked to Unit N · <title>" / "Standalone" hint on a
// programme Quizzes row. Derived (read-only) — see §9.2: the
// hint comes from a LEFT JOIN on nclex_programme_activities,
// not a stored column. A pure presentational piece.

import type { ProgrammeQuizSourceHint } from './types';
import { formatSourceHintLabel } from './format';

export function SourceHint({
  hint,
}: {
  hint: ProgrammeQuizSourceHint | null;
}) {
  if (hint) {
    return (
      <span
        className="pq-source-hint is-linked"
        title="Derived from a curriculum activity — read-only"
      >
        <LinkIcon />
        {formatSourceHintLabel(hint)}
      </span>
    );
  }
  return (
    <span
      className="pq-source-hint is-standalone"
      title="Attached directly to this programme — not in the curriculum"
    >
      <DotIcon />
      Standalone
    </span>
  );
}

function LinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
