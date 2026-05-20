// mynclex/lib/programme-quizzes/format.ts
//
// Display helpers for the programme Quizzes surface (Tutor Quiz
// Slice 5). Pure — safe to import from server and client modules.

import type { ProgrammeQuizSourceHint } from './types';

// "Linked to Unit 3 · Pharmacology basics" / "Linked to Module 2 ·
// Med-Surg deep dive". Unit-label terminology comes from the
// programme (WEEK / MODULE). Falls through to "Unit N" for an
// unknown label — defensive, shouldn't fire under v1's CHECK.
export function formatSourceHintLabel(
  hint: ProgrammeQuizSourceHint,
): string {
  const noun =
    hint.unit_label === 'MODULE' ? 'Module' : 'Unit';
  return `Linked to ${noun} ${hint.unit_index} · ${hint.unit_title}`;
}

// Short form used in the picker / inline contexts where the unit
// title would be too long. "Unit 3" / "Module 2".
export function formatSourceHintShort(
  hint: ProgrammeQuizSourceHint,
): string {
  const noun =
    hint.unit_label === 'MODULE' ? 'Module' : 'Unit';
  return `${noun} ${hint.unit_index}`;
}

// "1 programme" / "2 programmes" — drives the "Used in N
// programmes" chip on the global /tutor/quizzes card.
export function formatUsedInProgrammes(count: number): string {
  if (count === 0) return 'Not in any programme yet';
  if (count === 1) return 'Used in 1 programme';
  return `Used in ${count} programmes`;
}
