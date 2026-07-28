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

/** A bulk release: how many of each kind, and every question it touches. */
export type BulkSummary = {
  standalone: number;
  wrappers: number;
  questionsAffected: number;
};

export function CatPoolReleaseConfirm({
  id,
  kind,
  title,
  childCount,
  bulk,
  pending = false,
  onCancel,
  onConfirm,
}: {
  id?: string;
  kind?: 'item' | 'case' | 'trend';
  /** Wrapper title, for the two wrapper kinds. */
  title?: string | null;
  /** Child questions that come out with a wrapper. Ignored for a standalone. */
  childCount?: number;
  /** Present for a multi-select release; `id`/`kind` are then ignored. */
  bulk?: BulkSummary;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (bulk) {
    return <BulkBody bulk={bulk} pending={pending} onCancel={onCancel} onConfirm={onConfirm} />;
  }

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

/**
 * The bulk body. Its whole job is the number a curator cannot see: selecting
 * three case rows releases eighteen questions, and any children hidden by the
 * current filter go with them.
 */
function BulkBody({
  bulk,
  pending,
  onCancel,
  onConfirm,
}: {
  bulk: BulkSummary;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const parts: string[] = [];
  if (bulk.standalone) {
    parts.push(`${bulk.standalone} standalone question${bulk.standalone === 1 ? '' : 's'}`);
  }
  if (bulk.wrappers) {
    parts.push(`${bulk.wrappers} wrapper${bulk.wrappers === 1 ? '' : 's'}`);
  }
  const selectionText = parts.join(' and ');
  const sweptIn = bulk.questionsAffected - bulk.standalone;

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
        aria-label="Confirm bulk release from the CAT pool"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">
          Release {bulk.questionsAffected} question{bulk.questionsAffected === 1 ? '' : 's'} from
          the CAT pool?
        </p>

        <div className="auth-delete-confirm-note">
          You selected {selectionText}.
          {bulk.wrappers > 0 && (
            <>
              {' '}
              Because reservation lives on the wrapper, that takes{' '}
              <strong>
                {sweptIn} child question{sweptIn === 1 ? '' : 's'}
              </strong>{' '}
              out with them — including any currently hidden by your filters.
            </>
          )}
        </div>

        <p className="auth-delete-confirm-hint">
          Nothing is deleted. Every one of them returns to the practice pool and can be reserved
          again.
        </p>

        <div className="auth-delete-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Keep them reserved
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Releasing…' : `Release ${bulk.questionsAffected}`}
          </button>
        </div>
      </div>
    </div>
  );
}
