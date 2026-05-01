// mynclex/lib/bank/atoms/instruction-field.tsx
//
// Optional 2-row directive textarea shown above the stem on every
// question type. Controlled because the preview shows it live.

'use client';

interface InstructionFieldProps {
  value: string;
  onChange: (next: string) => void;
  name?: string;
}

export function InstructionField({
  value,
  onChange,
  name = 'instruction',
}: InstructionFieldProps) {
  return (
    <div className="auth-fg auth-instruction-wrap">
      <div className="auth-instruction-label">
        <span className="auth-instruction-icon">!</span>
        Instruction
        <span className="auth-instruction-optional">— optional</span>
      </div>
      <textarea
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="auth-instruction-input"
        rows={2}
        placeholder="Optional directive the student sees above the stem, e.g. 'Complete the sentence' or 'Select ALL that apply'. Leave blank if the stem is self-sufficient."
      />
      <p className="auth-instruction-hint">
        Optional. When blank, the student sees only the stem. Available on every question type.
      </p>
    </div>
  );
}
