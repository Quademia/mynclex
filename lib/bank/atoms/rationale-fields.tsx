// mynclex/lib/bank/atoms/rationale-fields.tsx
//
// Overall-rationale textarea + rationale image URL input. Always
// paired. Uncontrolled because the preview pre-submit doesn't show
// the rationale (the rationale is part of the post-submit experience).

interface RationaleFieldsProps {
  defaultRationale: string;
  defaultRationaleImg: string;
  rationaleName?: string;
  rationaleImgName?: string;
}

export function RationaleFields({
  defaultRationale,
  defaultRationaleImg,
  rationaleName = 'rationale',
  rationaleImgName = 'rationale_img',
}: RationaleFieldsProps) {
  return (
    <>
      <div className="auth-fg">
        <label htmlFor="rationale" className="auth-label">Overall rationale</label>
        <textarea
          id="rationale"
          name={rationaleName}
          rows={3}
          defaultValue={defaultRationale}
          placeholder="Explain why the correct answer is correct…"
          className="auth-input"
        />
      </div>
      <div className="auth-fg">
        <label htmlFor="rationale_img" className="auth-label">Rationale image URL</label>
        <input
          id="rationale_img"
          name={rationaleImgName}
          type="url"
          defaultValue={defaultRationaleImg}
          placeholder="https://… (paste a hosted image URL)"
          className="auth-input"
        />
        <p className="auth-hint">
          Paste a hosted URL for now. Direct upload lands in a later slice.
        </p>
      </div>
    </>
  );
}
