// mynclex/lib/overlays/bank/cat-pool-release-confirm.tsx
//
// Confirmation for taking a question out of the CAT pool (Slice 10b2-b).
//
// Every release asks — standalone and wrapper alike (Sam's call): a curator
// should not have to learn which ones prompt. No typed gate, because nothing
// is destroyed: the flag comes off, the question returns to practice, and
// re-reserving is one tick.
//
// The copy's real job is the CASCADE. Releasing a case writes one row but
// removes every one of its child questions from the pool, so the Coverage
// count drops by six rather than one. Saying that plainly is the whole reason
// the dialog exists.
//
// Reuses the shared .auth-delete-* dialog styling, as the other bank confirms do.

'use client';

export function CatPoolReleaseConfirm({
  id,
  kind,
  title,
  childCount,
  pending = false,
  onCancel,
  onConfirm,
}: {
  id: string;
  kind: 'item' | 'case' | 'trend';
  /** Wrapper title, for the two wrapper kinds. */
  title?: string | null;
  /** Child questions that come out with a wrapper. Ignored for a standalone. */
  childCount?: number;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isWrapper = kind !== 'item';
  const n = childCount ?? 0;
  const noun = kind === 'case' ? 'case study' : kind === 'trend' ? 'trend dataset' : 'question';

  return (
    <div
      className="auth-delete-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="auth-delete-confirm"
        role="alertdialog"
        aria-label="Confirm release from the CAT pool"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">
          Release this {noun} from the CAT pool?
        </p>

        <div className="auth-delete-confirm-note">
          {isWrapper ? (
            <>
              <code>{id}</code>
              {title ? <> — {title}</> : null} is reserved as a whole, so releasing it takes{' '}
              <strong>
                {n} child question{n === 1 ? '' : 's'}
              </strong>{' '}
              out of the pool with it. Your reserved count drops by {n}, not by one.
            </>
          ) : (
            <>
              <code>{id}</code> comes out of the reserved set and returns to the practice pool.
            </>
          )}
        </div>

        <p className="auth-delete-confirm-hint">
          Nothing is deleted and no content changes — the tick simply comes off. You can reserve
          it again at any time.
        </p>

        <div className="auth-delete-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Keep it reserved
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Releasing…' : 'Release'}
          </button>
        </div>
      </div>
    </div>
  );
}
