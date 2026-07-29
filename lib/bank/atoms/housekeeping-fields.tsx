'use client';

// mynclex/lib/bank/atoms/housekeeping-fields.tsx
//
// Question-ref / batch-id + visibility checkboxes + a read-only marks
// readout. Mode-aware:
//   - 'standalone' shows all four checkboxes.
//   - 'wrapper-child' hides is_published + is_builder_visible (the
//     wrapper centrally manages those for its children).
//
// ⚠ Nothing sets 'wrapper-child' any more — the 2026-05-01 case retrofit
// moved case children onto the row mapper's default 'standalone' so a
// curator could edit each child's visibility flags independently. The
// mode is kept because the type is still threaded everywhere, but it
// must NOT be used as a "is this a wrapper child" test: it is always
// 'standalone', so such a test silently passes for everything. That is
// exactly how the "Reserve for CAT" tick came to be shown on case
// children, which the CAT-pool page then ignored. Use
// <CaseChildScope> / useIsCaseChild() below instead.
//
// Marks are system-managed per bank-marks-and-scoring.html §5 — the
// editor computes them from the answer key on save. The curator sees
// the persisted value here as a read-only readout (no editable input).

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { QuestionType } from '@/lib/bank/classifications';
import { CAT_POOL_LABEL, CAT_POOL_HELP } from '@/lib/bank/atoms/cat-pool';

export type HousekeepingMode = 'standalone' | 'wrapper-child';

// A case child is mounted by the case wrapper page, never reached through the
// standalone bank list, so the fact travels as context rather than as a prop
// threaded through eleven row mappers that do not read `parent_case_id`.
const CaseChildContext = createContext(false);

/** Wrap the editors a CASE wrapper page mounts for its children. */
export function CaseChildScope({ children }: { children: ReactNode }) {
  return <CaseChildContext.Provider value={true}>{children}</CaseChildContext.Provider>;
}

export function useIsCaseChild(): boolean {
  return useContext(CaseChildContext);
}

interface HousekeepingFieldsProps {
  mode: HousekeepingMode;
  questionType: QuestionType;
  // §20 — show the admin-only "Reserve for CAT" tick. True only on the admin
  // bank surface; tutors never see it. Hidden on a case child regardless (the
  // reservation belongs to the wrapper and the database keeps the child in
  // step, so a tick here would be a control that does nothing).
  canReserveCat?: boolean;
  defaults: {
    marks: number;
    question_ref: string;
    batch_id: string;
    is_published: boolean;
    is_free_sample: boolean;
    is_builder_visible: boolean;
    shuffle_options: boolean;
    cat_pool: boolean;
  };
}

export function HousekeepingFields({ mode, questionType, canReserveCat, defaults }: HousekeepingFieldsProps) {
  const isCaseChild = useIsCaseChild();

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
        {canReserveCat && !isCaseChild && (
          <label className="auth-check">
            <input
              type="checkbox"
              name="cat_pool"
              defaultChecked={defaults.cat_pool}
              value="on"
            />
            <span>{CAT_POOL_LABEL} <span className="auth-hint">— {CAT_POOL_HELP}</span></span>
          </label>
        )}
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
    case 'MATRIX_MR':
      return `Max: ${marks} — count of correct cells across all rows`;
    case 'HIGHLIGHT':
      return `Max: ${marks} — count of correct chunks`;
    case 'CLOZE':
      return `Max: ${marks} — count of blanks`;
    case 'DRAG_CLOZE':
      return `Max: ${marks} — count of blanks`;
    case 'DRAG_ORDER':
      return `Max: ${marks} — count of slots`;
    case 'BOWTIE':
      return `Max: 5 — fixed (2 + 1 + 2)`;
  }
}
