// mynclex/app/(app)/admin/tutors/reinstate-modal.tsx
//
// The reinstate confirmation (sub-slice 1d). Single-use, beside its only
// caller, like the other two modals on this page.
//
// ⭐ THE DESIGN SAID REINSTATE NEEDS NO MODAL. Sam asked for one anyway
// (2026-08-21) and the design's reasoning does not actually contradict
// him: it argued that "undoing a restriction needs no justification the
// way imposing one does", which is an argument about REQUIRING A REASON,
// not about confirming. Those are different things, and this dialog
// keeps the design's rule — the note below is OPTIONAL.
//
// Two reasons the guard is worth having, and neither is symmetry:
//
//   ① ⭐ IT IS THE EASIER BUTTON TO HIT BY ACCIDENT. Suspend opens a
//      modal, so a slip there costs nothing. Reinstate sat next to
//      "Close" in the same drawer foot and fired instantly — putting a
//      suspended tutor back in the public catalogue and reopening their
//      checkout. The dangerous-to-misclick button was the unguarded one.
//
//   ② ⭐⭐ SINCE 1d-i, A MISCLICK CANNOT BE UNDONE IN THE RECORD. When
//      the handoff was written the trail was derived from scalars and a
//      stray click merely overwrote decided_at. decision_history is
//      append-only: correcting a wrong reinstatement means suspending
//      again, which writes TWO more entries, and the tutor's history
//      then permanently shows a reversal that never really happened.
//      State is recoverable; history is not.
//
// ⚠ NOT a type-to-confirm gate. CLAUDE.md reserves those for destructive
// or irreversible actions and reinstatement is neither — it restores
// access rather than removing it, and it can be suspended again.

'use client';

import { useState } from 'react';
import { reinstateTutorAction } from '@/lib/tutors/actions';

/** The inverse of the suspend panel: what comes back on. */
const SWITCHES: { what: string; label: string }[] = [
  { what: 'Tutor workspace — TUTOR role restored', label: 'Reopens' },
  { what: 'Programmes back in the catalogue, checkout open', label: 'Reopens' },
  { what: 'Instalment collection on their programmes', label: 'Resumes' },
];

export function ReinstateModal({
  userId,
  name,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await reinstateTutorAction(userId, note);

    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    onDone(
      res.changed
        ? `${res.name} reinstated — TUTOR restored, programmes back in the catalogue.`
        : `${res.name} was not suspended — nothing changed.`,
    );
  }

  return (
    <div className="adt-modal-wrap" onClick={onClose}>
      <div
        className="adt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Reinstate ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adt-modal-title">Reinstate {name}</div>
        <p className="adt-modal-sub">
          Their suspension is lifted and everything it stopped starts again.
        </p>

        <div className="adt-switches">
          {SWITCHES.map((s) => (
            <div key={s.what} className="adt-sw">
              <span className="adt-sw-what">{s.what}</span>
              <span className="adt-sw-badge keep">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ⭐ The consequence nobody would guess, and the reason this
            dialog earns its place beyond the misclick argument. While the
            tutor was suspended we deliberately stopped collecting AND
            stopped pausing (migration 20260919120000), so any arrears
            built up invisibly. Reinstating hands that backlog back to the
            sweep. The student is warned in the same run they are paused —
            2b runs before 2c — but the admin should know it is coming. */}
        <div className="adt-note">
          ⚠ <strong>Arrears resume too.</strong> Nobody was chased for payment while
          they were suspended, so any student who fell behind in that time can be
          paused by tonight&rsquo;s sweep. Each of them is emailed in the same pass,
          so nobody is locked out unwarned — but expect it.
        </div>

        <div className="form-group" style={{ marginTop: 14 }}>
          <label htmlFor="reinstate-note">
            Note <span className="form-hint">(optional — goes on the record beside the suspension)</span>
          </label>
          <textarea
            id="reinstate-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this was lifted, if it is worth remembering."
            disabled={busy}
          />
        </div>

        {error && <p className="adt-form-error">{error}</p>}

        <div className="adt-modal-foot">
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {/* No disabled-until-typed gate: the note is optional, so the
              confirm button is live from the moment the dialog opens. */}
          <button type="button" className="btn btn-accent btn-sm" onClick={confirm} disabled={busy}>
            {busy ? 'Reinstating…' : 'Reinstate tutor'}
          </button>
        </div>
      </div>
    </div>
  );
}
