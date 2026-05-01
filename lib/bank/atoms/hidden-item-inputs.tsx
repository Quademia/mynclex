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
}

export function HiddenItemInputs({ type, itemId, surface }: HiddenItemInputsProps) {
  return (
    <>
      <input type="hidden" name="question_type" value={type} />
      <input type="hidden" name="surface" value={surface} />
      {itemId && <input type="hidden" name="item_id" value={itemId} />}
    </>
  );
}
