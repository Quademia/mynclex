// mynclex/lib/bank/atoms/housekeeping-fields.tsx
//
// Marks / question-ref / batch-id + visibility checkboxes. Mode-aware:
// - 'standalone' shows all four checkboxes.
// - 'wrapper-child' hides is_published + is_builder_visible (the
//   wrapper centrally manages those for its children).

export type HousekeepingMode = 'standalone' | 'wrapper-child';

interface HousekeepingFieldsProps {
  mode: HousekeepingMode;
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

export function HousekeepingFields({ mode, defaults }: HousekeepingFieldsProps) {
  return (
    <>
      <div className="auth-grid-3">
        <div className="auth-fg">
          <label htmlFor="marks" className="auth-label">Marks</label>
          <input
            id="marks"
            name="marks"
            type="number"
            min={0.5}
            step={0.5}
            defaultValue={defaults.marks}
            className="auth-input"
          />
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
