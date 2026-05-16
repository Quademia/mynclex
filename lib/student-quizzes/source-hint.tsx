// mynclex/lib/student-quizzes/source-hint.tsx
//
// "Linked to Unit N · <title>" / "Standalone practice" hint on a
// student Quizzes row. Mirrors the Slice 5 tutor-side hint but
// with friendlier student copy for the standalone case ("Standalone
// practice" — what the student sees as a self-paced affordance —
// instead of the tutor-side terse "Standalone" placement type).

import type { StudentQuizSourceHint } from './types';
import { formatStudentSourceHintLabel } from './format';

export function StudentSourceHint({
  hint,
}: {
  hint: StudentQuizSourceHint | null;
}) {
  if (hint) {
    return (
      <span
        className="sq-source-hint is-linked"
        title="From an activity in the curriculum"
      >
        <LinkIcon />
        {formatStudentSourceHintLabel(hint)}
      </span>
    );
  }
  return (
    <span
      className="sq-source-hint is-standalone"
      title="Attached to the programme as standalone practice"
    >
      <DotIcon />
      Standalone practice
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
