// mynclex/lib/bank/atoms/housekeeping-fields.tsx
//
// Question-ref / batch-id + visibility checkboxes + a read-only marks
// readout. Mode-aware:
//   - 'standalone' shows all four checkboxes.
//   - 'wrapper-child' hides is_published + is_builder_visible (the
//     wrapper centrally manages those for its children).
//
// Marks are system-managed per bank-marks-and-scoring.html §5 — the
// editor computes them from the answer key on save. The curator sees
// the persisted value here as a read-only readout (no editable input).

import type { QuestionType } from '@/lib/bank/classifications';

export type HousekeepingMode = 'standalone' | 'wrapper-child';

interface HousekeepingFieldsProps {
  mode: HousekeepingMode;
  questionType: QuestionType;
  defaults: {
    marks: number;
    question_ref: string;
    batch_id: string;
    is_published: boolean;
    is_free_sample: boolean;
    is_builder_visible: boolean;
    shuffle_options: boolean;
  };
}

export function HousekeepingFields({ mode, questionType, defaults }: HousekeepingFieldsProps) {
  return (
    <>
      <div className="auth-grid-3">
        <div className="auth-fg">
          <label className="auth-label">Max possible score</label>
          <div className="auth-readonly-value">
            {formatMarksLabel(questionType, defaults.marks)}
          </div>
          <p className="auth-hint">
            Computed automatically from the answer key. Updates on save.
          </p>
        </div>
        <div className="auth-fg">
          <label htmlFor="qref" className="auth-label">Question ref</label>
          <input
            id="qref"
            name="question_ref"
            type="text"
            defaultValue={defaults.question_ref}
            placeholder="e.g. CARDIO-Q12"
            className="auth-input"
          />
        </div>
        <div className="auth-fg">
          <label htmlFor="batch" className="auth-label">Batch ID</label>
          <input
            id="batch"
            name="batch_id"
            type="text"
            defaultValue={defaults.batch_id}
            placeholder="e.g. BATCH_2026_05"
            className="auth-input"
          />
        </div>
      </div>

      <div className="auth-checks">
        {mode === 'standalone' && (
          <label className="auth-check">
            <input
              type="checkbox"
              name="is_published"
              defaultChecked={defaults.is_published}
            />
            <span>Published (visible to students)</span>
          </label>
        )}
        <label className="auth-check">
          <input
            type="checkbox"
            name="is_free_sample"
            defaultChecked={defaults.is_free_sample}
          />
          <span>Free sample</span>
        </label>
        {mode === 'standalone' && (
          <label className="auth-check">
            <input
              type="checkbox"
              name="is_builder_visible"
              defaultChecked={defaults.is_builder_visible}
              value="on"
            />
            <span>Visible in student quiz builder</span>
          </label>
        )}
        <label className="auth-check">
          <input
            type="checkbox"
            name="shuffle_options"
            defaultChecked={defaults.shuffle_options}
            value="on"
          />
          <span>Shuffle options when shown to students</span>
        </label>
      </div>
    </>
  );
}

// Per-type display string for the marks readout. Suffix describes the
// rule (e.g. "count of correct options ticked") rather than asserting
// a specific count, so it stays accurate on never-saved questions
// where the persisted value is still the column default.
function formatMarksLabel(questionType: QuestionType, marks: number): string {
  switch (questionType) {
    case 'MCQ':
    case 'TF':
      return `Max: ${marks}`;
    case 'SATA':
    case 'SELECT_N':
      return `Max: ${marks} — count of correct options ticked`;
    case 'MATRIX':
      return `Max: ${marks} — count of rows`;
    case 'HIGHLIGHT':
      return `Max: ${marks} — count of correct chunks`;
    case 'CLOZE':
      return `Max: ${marks} — count of blanks`;
    case 'DRAG_DROP':
      return `Max: ${marks} — count of slots`;
    case 'BOWTIE':
      return `Max: 5 — fixed (2 + 1 + 2)`;
  }
}
