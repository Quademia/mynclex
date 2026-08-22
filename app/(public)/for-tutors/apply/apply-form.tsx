// mynclex/app/(public)/for-tutors/apply/apply-form.tsx
//
// The application form itself — sub-slice 2a-i. Single-use, so it lives
// beside its only caller per the folder convention.
//
// ⭐ ONE COMPONENT FOR APPLYING AND RE-APPLYING. §9's rule is that
// resubmission reveals "the form pre-filled from the previous
// submission", and the only differences that survive are the wording and
// the Request number — the fields, the validation and the action are the
// same. Two components would be two places for the field list to drift.
//
// ⚠ THE FORM ASKS FOR NO EMAIL AND NO NAME. §5: a signed-in person's
// application belongs to their SESSION, and the RPC writes from
// auth.uid(). Offering an email box here would invite somebody to type
// one that is not theirs and expect it to mean something.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitApplicationAction } from '@/lib/tutors/actions';
import { APPLY_DRAFT_KEY } from './guest-apply';

/** Enough to judge on, short enough that nobody abandons it. */
const NOTE_MIN = 40;

export function ApplyForm({
  mode,
  initialOrganisation,
  initialNote,
  nextSubmissionCount,
}: {
  mode: 'NEW' | 'RESUBMIT';
  initialOrganisation: string;
  initialNote: string;
  /** What this submission will be numbered, for the button's promise. */
  nextSubmissionCount: number;
}) {
  const router = useRouter();
  const [organisation, setOrganisation] = useState(initialOrganisation);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⭐ THE OTHER HALF OF THE SIGN-IN BOUNCE (2a-ii). Somebody who typed
  // their application while logged out, hit "you already have an
  // account", signed in and came back arrives HERE — and if the form were
  // empty they would have to write the whole thing again, which is the
  // dead end the email-first routing exists to remove.
  //
  // ⚠ Only fills EMPTY fields. A resubmission (§9) arrives pre-filled
  // from the previous submission, and a stale draft must never overwrite
  // what the applicant actually sent us last time.
  //
  // ⓘ Cleared as soon as it is read: it is a hand-off across one
  // navigation, not a saved draft, and leaving it behind would repopulate
  // a form they had deliberately emptied.
  // ⚠ THE TWO DISABLES BELOW ARE DELIBERATE, and this is the reason so it
  // survives. `react-hooks/set-state-in-effect` is right in general —
  // setState in an effect body causes a cascading render. It cannot see
  // the case it is looking at: sessionStorage is exactly the "external
  // system" React's own guidance says effects are FOR, and reading it
  // any earlier is not available to us. A lazy useState initialiser runs
  // during server rendering, where `window` does not exist; guarding it
  // with `typeof window` instead produces server HTML that says "empty"
  // and client HTML that says "here is your draft", which is a hydration
  // mismatch. One extra render on the one navigation where a draft
  // exists is the cheaper of the two.
  useEffect(() => {
    let draft: { organisation?: string; note?: string } | null = null;
    try {
      const raw = window.sessionStorage.getItem(APPLY_DRAFT_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(APPLY_DRAFT_KEY);
      draft = JSON.parse(raw) as { organisation?: string; note?: string };
    } catch {
      // Unparseable, or storage unavailable. Nothing is lost that was
      // not already lost, so this stays silent.
      return;
    }
    // ⓘ One disable, not two: the rule reports once per effect body, and
    // an unused directive is itself a warning here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (draft.organisation && !initialOrganisation) setOrganisation(draft.organisation);
    if (draft.note && !initialNote) setNote(draft.note);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = note.trim();
  const ready = trimmed.length >= NOTE_MIN;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const res = await submitApplicationAction(organisation, note);

    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    // ⓘ No toast and no success screen of its own. The action revalidates
    // this route, so refreshing lands them on the PENDING state — which
    // IS the confirmation, and is the same thing they will see when they
    // come back next week. A separate "thanks!" page would be a sixth
    // state that exists for ten seconds and then never again.
    router.refresh();
  }

  return (
    <form
      className="ft-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="form-group">
        <label htmlFor="ft-org">
          Where do you work?{' '}
          <span className="form-hint">
            Optional — plenty of good tutors are freelance
          </span>
        </label>
        <input
          id="ft-org"
          type="text"
          value={organisation}
          onChange={(e) => setOrganisation(e.target.value)}
          placeholder="Hospital, school or practice"
          disabled={busy}
          maxLength={160}
        />
      </div>

      <div className="form-group">
        <label htmlFor="ft-note">
          Tell us about yourself{' '}
          <span className="form-hint">
            Your nursing and teaching background, and how you would run a
            programme
          </span>
        </label>
        <textarea
          id="ft-note"
          rows={8}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How long you have been an RN, whether you have taught NCLEX before, and what a programme of yours would look like week by week."
          disabled={busy}
          maxLength={4000}
        />
        {/* ⚠ Advise, don't block — until it is genuinely too short to
            judge. A curator-side habit that applies here for the same
            reason: the floor exists so an application is reviewable, not
            to make somebody guess a word count. */}
        <p className="ft-counter">
          {ready
            ? `${trimmed.length} characters`
            : `${trimmed.length} of at least ${NOTE_MIN} characters — we need enough to review`}
        </p>
      </div>

      {error && <p className="ft-error">{error}</p>}

      <div className="ft-form-foot">
        <button
          type="submit"
          className="ft-cta"
          disabled={!ready || busy}
        >
          {busy
            ? 'Sending…'
            : mode === 'RESUBMIT'
              ? `Resubmit as Request #${nextSubmissionCount}`
              : 'Submit application'}
        </button>
        {mode === 'RESUBMIT' && (
          <p className="ft-form-note">
            This replaces your previous application. The reason we gave stays
            on your record so whoever reviews it can see the whole story.
          </p>
        )}
      </div>
    </form>
  );
}
