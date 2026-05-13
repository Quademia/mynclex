// mynclex/lib/overlays/programmes/programme-length-decrease-confirm.tsx
//
// Type-to-confirm overlay for reducing a programme's length when
// the to-be-removed unit tail isn't empty. The DB trigger that
// reconciles the unit table fires unconditionally once the
// UPDATE reaches it — this overlay is the application-layer gate
// that stops a tutor from accidentally cascade-deleting their
// own work.
//
// Surfaces the impact summary computed server-side
// (editProgrammeAction's `requiresConfirm` response): which
// unit indices are being removed and how many blocks +
// activities cascade-delete with them.
//
// Re-uses the auth-delete-* class set in styles/authoring.css for
// visual parity with DeleteConfirm + DiscardConfirm; the class
// names are historical but the styles are shared across the
// workspace bundle.

interface ProgrammeLengthDecreaseConfirmProps {
  /** Unit indices that will be removed, ordered ascending. */
  affectedUnitIndices: number[];
  /** Count of blocks across the removed units. */
  blocks: number;
  /** Count of activities across the removed units. */
  activities: number;
  /** 'WEEK' → "Week N"; 'MODULE' → "Module N". */
  unitLabel: 'WEEK' | 'MODULE';
  /** Tutor's typed text — confirm button is gated on this === 'DELETE'. */
  deleteText: string;
  /** True while the save action is in flight. */
  pending?: boolean;
  /** Called when the tutor types into the confirmation input. */
  onTextChange: (text: string) => void;
  /** Called on Cancel button or backdrop click (only when not pending). */
  onCancel: () => void;
  /** Called on Confirm. Host re-fires the save with confirmDestructive=true. */
  onConfirm: () => void;
}


function formatIndices(indices: number[], labelNoun: string): string {
  if (indices.length === 0) return '';
  if (indices.length === 1) return `${labelNoun} ${indices[0]}`;
  // Contiguous range? "Weeks 9–12". Otherwise list: "Weeks 9, 11, 12".
  // The trigger removes a contiguous tail (unit_index > new length),
  // so the range form is the common case — left the list fallback
  // in for defensive defence against odd inputs.
  const isContiguous = indices.every(
    (n, i) => i === 0 || n === indices[i - 1] + 1
  );
  if (isContiguous) {
    return `${labelNoun}s ${indices[0]}–${indices[indices.length - 1]}`;
  }
  return `${labelNoun}s ${indices.join(', ')}`;
}


export function ProgrammeLengthDecreaseConfirm({
  affectedUnitIndices,
  blocks,
  activities,
  unitLabel,
  deleteText,
  pending = false,
  onTextChange,
  onCancel,
  onConfirm,
}: ProgrammeLengthDecreaseConfirmProps) {
  const labelNoun = unitLabel === 'WEEK' ? 'Week' : 'Module';
  const indicesPhrase = formatIndices(affectedUnitIndices, labelNoun);

  // Build the "and X blocks, Y activities" tail. Either count can
  // be zero — only render the parts that are non-zero.
  const tailParts: string[] = [];
  if (blocks > 0) tailParts.push(`${blocks} ${blocks === 1 ? 'block' : 'blocks'}`);
  if (activities > 0) {
    tailParts.push(`${activities} ${activities === 1 ? 'activity' : 'activities'}`);
  }
  const tail =
    tailParts.length > 0 ? ` and their content (${tailParts.join(', ')})` : '';

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
        aria-label="Confirm shorter programme length"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">Shorten programme?</p>
        <p className="auth-delete-confirm-hint">
          Reducing the length will permanently delete {indicesPhrase}{tail}.
          This is irreversible. Type <strong>DELETE</strong> to confirm.
        </p>
        <input
          type="text"
          className="auth-input"
          value={deleteText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type DELETE"
          autoFocus
          disabled={pending}
        />
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
            disabled={deleteText !== 'DELETE' || pending}
          >
            {pending ? 'Saving…' : 'Confirm shorten'}
          </button>
        </div>
      </div>
    </div>
  );
}
