'use client';

// mynclex/lib/library/embed-create-flow.tsx
//
// The "Create a new question" path for the embedded-questions block
// (slice 11.15d). Two steps:
//   1. A small type picker — only the 4 classic single-question types
//      are enabled (MCQ / T-F / SATA / Select-N); the 5 NGN types show
//      disabled with a "Quiz only" tag (their partial-credit grading
//      doesn't fit the embed answer model — see the planning doc).
//   2. The EXISTING bank question editor for the chosen type, mounted
//      unchanged — but with a blank initial pre-set to Publish ON and
//      stamped with `parentNoteId` so the saved question is a normal,
//      reusable bank question tagged "Note-created".
//
// On save the new question's item_id is handed back to the block
// (`onCreated`) and appended as a reference card. The whole flow is
// portaled to <body> so the editor's form inputs live outside the
// ProseMirror contentEditable tree.

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { McqEditor } from '@/lib/bank/editors/mcq-editor';
import { TfEditor } from '@/lib/bank/editors/tf-editor';
import { SataEditor } from '@/lib/bank/editors/sata-editor';
import { SelectNEditor } from '@/lib/bank/editors/select-n-editor';
import { emptyMcqInitial } from '@/lib/bank/editors/mcq-row-mapper';
import { emptyTfInitial } from '@/lib/bank/editors/tf-row-mapper';
import { emptySataInitial } from '@/lib/bank/editors/sata-row-mapper';
import { emptySelectNInitial } from '@/lib/bank/editors/select-n-row-mapper';

type EmbedType = 'MCQ' | 'TF' | 'SATA' | 'SELECT_N';

const TYPE_ROWS: { code: string; label: string; type?: EmbedType }[] = [
  { code: 'MCQ', label: 'Multiple choice — one correct answer', type: 'MCQ' },
  { code: 'True-False', label: 'A single true / false statement', type: 'TF' },
  { code: 'SATA', label: 'Select all that apply', type: 'SATA' },
  { code: 'Select-N', label: 'Select exactly N options', type: 'SELECT_N' },
  { code: 'Matrix', label: 'Grid — one correct per row' },
  { code: 'Bow-tie', label: '5-slot NGN (2 · 1 · 2)' },
  { code: 'Cloze', label: 'Fill-in-the-blank sentence' },
  { code: 'Highlight', label: 'Click the correct findings in a passage' },
  { code: 'Drag-drop', label: 'Ordered list or sentence slots' },
];

interface EmbedCreateFlowProps {
  noteId: string | null;
  onCreated: (itemId: string) => void;
  onClose: () => void;
}

export function EmbedCreateFlow({ noteId, onCreated, onClose }: EmbedCreateFlowProps) {
  const [type, setType] = useState<EmbedType | null>(null);

  if (typeof document === 'undefined') return null;

  // Step 2 — the chosen type's editor, blank, Publish-on, note-stamped.
  if (type) {
    const handleSaved = (r: { item_id: string }) => onCreated(r.item_id);
    let editor: React.ReactNode = null;
    if (type === 'MCQ') {
      editor = (
        <McqEditor
          initial={{ ...emptyMcqInitial('tutor'), is_published: true, parentNoteId: noteId }}
          onClose={onClose}
          onSaved={handleSaved}
        />
      );
    } else if (type === 'TF') {
      editor = (
        <TfEditor
          initial={{ ...emptyTfInitial('tutor'), is_published: true, parentNoteId: noteId }}
          onClose={onClose}
          onSaved={handleSaved}
        />
      );
    } else if (type === 'SATA') {
      editor = (
        <SataEditor
          initial={{ ...emptySataInitial('tutor'), is_published: true, parentNoteId: noteId }}
          onClose={onClose}
          onSaved={handleSaved}
        />
      );
    } else {
      editor = (
        <SelectNEditor
          initial={{ ...emptySelectNInitial('tutor'), is_published: true, parentNoteId: noteId }}
          onClose={onClose}
          onSaved={handleSaved}
        />
      );
    }
    return createPortal(editor, document.body);
  }

  // Step 1 — the type picker.
  return createPortal(
    <div
      className="eq-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="eq-modal"
        style={{ maxWidth: 460 }}
        role="dialog"
        aria-modal="true"
        aria-label="New question — pick a type"
      >
        <div className="eq-modal__head">
          <h3>New question — pick a type</h3>
          <p>
            Author it inline. It’s saved to your bank as a normal, reusable
            question and dropped into this block as a Note-created card.
          </p>
          <button className="eq-modal__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="eq-typewrap">
          <ul className="eq-typelist">
            {TYPE_ROWS.map((row) => {
              const enabled = !!row.type;
              return (
                <li key={row.code}>
                  <button
                    type="button"
                    className={enabled ? 'eq-typebtn' : 'eq-typebtn off'}
                    disabled={!enabled}
                    onClick={() => enabled && setType(row.type!)}
                  >
                    <span className="eq-typecode">{row.code}</span>
                    <span className="eq-typelabel">{row.label}</span>
                    {enabled ? (
                      <span aria-hidden="true">›</span>
                    ) : (
                      <span className="eq-typetag">Quiz only</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="eq-typenote">
            <span aria-hidden="true">ℹ</span>
            <span>
              NGN types (Matrix, Bow-tie, Cloze…) are built for full quizzes —
              add those from a quiz instead of an inline note block.
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
