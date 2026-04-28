// mynclex/lib/authoring/standalone-question-modal.tsx
//
// Host for a standalone question editor — wraps ModalFrame and mounts
// whichever of the 9 question editors matches the question's type.
//
// Slice 1: only McqEditor exists. Other types throw a "not yet
// implemented" placeholder until their slices land.
//
// State ownership: the host owns the editor's value via useState
// (initial seed comes from props, set by the server page from a
// rowToMcq parse). Save and Publish are wired in Slices 2 and 7.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModalFrame } from './primitives/modal-frame';
import { McqEditor } from './editors/mcq/editor';
import type { McqValue } from './editors/mcq/value';

// Editor value union widens as more types ship. Slice 1: MCQ only.
export type QuestionEditorValue = McqValue;

export type SupportedQuestionType = 'MCQ';

export function StandaloneQuestionModal({
  initial,
  questionType,
  cancelHref,
}: {
  initial: QuestionEditorValue;
  questionType: SupportedQuestionType;
  cancelHref: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<QuestionEditorValue>(initial);

  function close() {
    router.push(cancelHref);
  }

  return (
    <ModalFrame
      title="Edit question"
      itemId={value.meta.itemId || null}
      isPublished={value.meta.isPublished}
      onCancel={close}
      onClose={close}
      saveDisabled
      saveDisabledReason="Save lands in Slice 2"
      publishDisabled
      publishDisabledReason="Publish lands in Slice 7"
    >
      {questionType === 'MCQ' && <McqEditor value={value} onChange={setValue} />}
    </ModalFrame>
  );
}
