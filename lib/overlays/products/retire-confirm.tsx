// mynclex/lib/overlays/products/retire-confirm.tsx
//
// Confirmation for retiring a product. Deliberately NOT the typed-gate
// treatment: retiring is reversible (reactivate) and destroys nothing —
// the copy's job is to say so, so nobody hunts for a delete button.
// Reuses the .auth-delete-* dialog chrome; the primary button is ghost-
// danger rather than danger-filled because this is a soft stop, not a
// destruction.

'use client';

export function ProductRetireConfirm({
  productName,
  pending = false,
  onCancel,
  onConfirm,
}: {
  productName: string;
  pending?:    boolean;
  onCancel:    () => void;
  onConfirm:   () => void;
}) {
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
        aria-label="Confirm retire product"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">Retire {productName}?</p>
        <div className="auth-delete-confirm-note">
          It stops appearing at checkout straight away. Nothing is deleted —
          the record stays so past payments keep pointing at it, and you can
          reactivate it any time.
        </div>
        <div className="auth-delete-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Retiring…' : 'Retire product'}
          </button>
        </div>
      </div>
    </div>
  );
}
