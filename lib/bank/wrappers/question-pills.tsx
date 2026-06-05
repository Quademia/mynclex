// mynclex/lib/bank/wrappers/question-pills.tsx
//
// Small published / draft breakdown shown on the case-study and trend
// wrapper LIST pages: of a wrapper's attached questions, how many are
// live vs still draft. Pairs with the wrapper's own Published/Draft
// status tag — a published wrapper showing no "published" questions
// flags the "looks live but reaches nobody" state at a glance (the
// thing the publish gates protect against).
//
// Pure presentational — safe to render from the server page components.
// Reuses the .auth-cs-tag ok/muted pills already used in these tables.

interface Props {
  total:     number;
  published: number;
}

export function QuestionPills({ total, published }: Props) {
  const draft = Math.max(0, total - published);
  if (total === 0) return null;
  return (
    <>
      {published > 0 && (
        <span className="auth-cs-tag ok" style={{ marginLeft: 6 }}>
          {published} published
        </span>
      )}
      {draft > 0 && (
        <span className="auth-cs-tag muted" style={{ marginLeft: 6 }}>
          {draft} draft
        </span>
      )}
    </>
  );
}
