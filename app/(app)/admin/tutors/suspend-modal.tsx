// mynclex/app/(app)/admin/tutors/suspend-modal.tsx
//
// The suspend confirmation (sub-slice 1d). Single-use, so it sits beside
// its only caller per the folder convention — same as add-tutor-modal.
//
// ⭐ WHY THE FOUR SWITCHES ARE ON SCREEN. Suspension is not one action,
// it is four separable ones (§7), and three of them stop while the
// fourth deliberately does NOT. An admin who cannot see that will assume
// the worst — that they are about to cut off students who paid — and
// either won't press the button or will press it believing something
// false. Showing which switch ISN'T firing is the point of the panel.
//
// ⚠ Every badge here is a claim about what the code does. If a switch
// ever stops being true, this list is the first thing to correct: a
// panel that lies is worse than no panel, because it is read as a
// guarantee.
//
// A reason is required. The design asked for it and the plan doc only
// required one on REJECT; we took the design's side, because a
// suspension with no recorded why is unreadable months later when
// reinstatement comes up. ⓘ The tutor can read it — reasons here are
// written as if they will (see the migration's note on visibility), and
// the label says so rather than leaving the admin to guess.

'use client';

import { useState } from 'react';
import { suspendTutorAction } from '@/lib/tutors/actions';

/** The four switches of §7, in the order the tutor feels them. */
const SWITCHES: { what: string; badge: 'stop' | 'keep'; label: string }[] = [
  { what: 'New students joining — leaves the catalogue, checkout blocked', badge: 'stop', label: 'Stopped' },
  { what: 'Instalment collection on their programmes', badge: 'stop', label: 'Stopped' },
  { what: 'Tutor workspace — TUTOR role revoked', badge: 'stop', label: 'Stopped' },
  { what: "Existing students' curriculum, library & quizzes", badge: 'keep', label: 'Kept' },
];

export function SuspendModal({
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
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = reason.trim().length > 0;

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const res = await suspendTutorAction(userId, reason);

    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    // "changed: false" means they were already suspended — another admin
    // got there first, or this is a second click. Saying "suspended"
    // would claim an act that did not happen.
    onDone(
      res.changed
        ? `${res.name} suspended — TUTOR revoked, programmes off the catalogue. Existing students keep their materials.`
        : `${res.name} was already suspended — nothing changed.`,
    );
  }

  return (
    <div className="adt-modal-wrap" onClick={onClose}>
      <div
        className="adt-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Suspend ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adt-modal-title">Suspend {name}</div>
        <p className="adt-modal-sub">
          Suspension separates <em>materials</em> from <em>live delivery</em> —
          students they already have are not punished for the tutor&rsquo;s
          conduct.
        </p>

        <div className="adt-switches">
          {SWITCHES.map((s) => (
            <div key={s.what} className="adt-sw">
              <span className="adt-sw-what">{s.what}</span>
              <span className={`adt-sw-badge ${s.badge}`}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="suspend-reason">
            Reason <span className="form-hint">(kept on the record — shown if they ever re-apply)</span>
          </label>
          <textarea
            id="suspend-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What happened, in enough detail to be useful in six months."
            disabled={busy}
          />
        </div>

        {error && <p className="adt-form-error">{error}</p>}

        <div className="adt-modal-foot">
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {/* Disabled until there is a reason. The RPC refuses an empty
              one too — this is the courtesy, that is the enforcement. */}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={confirm}
            disabled={!ready || busy}
          >
            {busy ? 'Suspending…' : 'Suspend tutor'}
          </button>
        </div>
      </div>
    </div>
  );
}
