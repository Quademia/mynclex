// mynclex/lib/bank/atoms/hidden-item-inputs.tsx
//
// The boring hidden inputs every editor emits: question_type, item_id
// (in edit mode only), and surface (admin / tutor). Pulled out so the
// editor file doesn't restate them.

import type { QuestionType } from '@/lib/bank/classifications';

interface HiddenItemInputsProps {
  type: QuestionType;
  itemId: string | null;
  surface: 'admin' | 'tutor';
  /**
   * Slice 11.15 — set when the editor is launched from a library
   * note's "Create a new question" embed flow. Emits a
   * `parent_note_id` hidden input so `saveQuestionAction` stamps the
   * new question with its origin note (an origin label only — the
   * question stays builder-visible + reusable). Absent in every other
   * launch context, so the bank / case / trend flows are unaffected.
   */
  parentNoteId?: string | null;
}

export function HiddenItemInputs({
  type,
  itemId,
  surface,
  parentNoteId,
}: HiddenItemInputsProps) {
  return (
    <>
      <input type="hidden" name="question_type" value={type} />
      <input type="hidden" name="surface" value={surface} />
      {itemId && <input type="hidden" name="item_id" value={itemId} />}
      {parentNoteId && (
        <input type="hidden" name="parent_note_id" value={parentNoteId} />
      )}
    </>
  );
}
