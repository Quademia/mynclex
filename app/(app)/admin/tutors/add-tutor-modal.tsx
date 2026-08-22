// mynclex/app/(app)/admin/tutors/add-tutor-modal.tsx
//
// "+ Add tutor" — sub-slice 1c. Single-use, next to its only caller.
// Plan: docs/product-plan/tutor-onboarding.md §11.1c.
//
// ⭐ A CHOOSER, THEN A MODE-SPECIFIC FORM (Sam's design). The two paths
// need DIFFERENT INPUTS, which is why one clever field does not work:
// promoting needs only an identity (search and pick), while inviting
// needs an email PLUS a name, because a user record is being created
// from nothing. A field that changes shape as you type is worse than a
// choice made up front.
//
// ⚠ THE CHOOSER ASKS THE ADMIN SOMETHING THEY MAY NOT KNOW — whether
// this person ever registered — so each path must offer a way to the
// other. Path A's "not found" offers the new-user route; in 1c-ii, path
// B's email check offers promotion when the address is already taken.
// Without those hatches a wrong branch is a dead end and a guess.
//
// ⓘ 1c-i shipped path A end to end, and path B as an honest stopgap —
// "have them register, then add them as an existing user". 1c-ii added
// the as-you-type email check and the hatch back. ⭐ SLICE 3 REPLACED
// THE STOPGAP IN PLACE: same form, same branch, no second button, so
// there was never a moment with two controls doing one job.

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  checkEmailForTutorAddAction,
  findUsersForTutorAddAction,
  inviteTutorByEmailAction,
  promoteUserToTutorAction,
  type EmailVerdict,
  type TutorSearchHit,
} from '@/lib/tutors/actions';

type Mode = null | 'EXISTING' | 'NEW';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase();
}

export function AddTutorModal({
  onClose,
  onAdded,
  onOpenTutor,
}: {
  onClose: () => void;
  onAdded: (message: string) => void;
  /** "Already a tutor" -> close and show that person's record. */
  onOpenTutor: (userId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [query, setQuery] = useState('');
  // Results carry the query that produced them, so "is this list current?"
  // is DERIVED at render rather than tracked in a second state variable.
  // That also removes the need to clear state from inside the effect —
  // which react-hooks/set-state-in-effect rightly flags, and which would
  // have flashed the previous query's results on the way to the new ones.
  const [hits, setHits] = useState<{ q: string; rows: TutorSearchHit[] } | null>(null);
  const [picked, setPicked] = useState<TutorSearchHit | null>(null);
  const [email, setEmail] = useState('');
  // Same shape as the search results, and for the same reason: the answer
  // carries the address it is about, so "is this verdict current?" is
  // derived at render instead of a flag that can disagree with it.
  const [check, setCheck] = useState<{ addr: string; result: EmailVerdict | null } | null>(null);
  // Slice 3. Asked for only once the address comes back free — the whole
  // point of checking as you type is that nobody fills in a name for an
  // address that turns out to be taken.
  const [forename, setForename] = useState('');
  const [surname, setSurname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce, plus a sequence guard so a slow response for "st" cannot
  // overwrite the results for "steven" typed after it.
  const seq = useRef(0);
  const needle = query.trim();
  const tooShort = needle.length < 2;

  useEffect(() => {
    if (mode !== 'EXISTING' || tooShort) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      findUsersForTutorAddAction(needle)
        .then((rows) => {
          // The sequence guard: a slow answer for "st" must not overwrite
          // the results for "steven" typed after it.
          if (seq.current === mine) setHits({ q: needle, rows });
        })
        .catch(() => {
          if (seq.current === mine) setHits({ q: needle, rows: [] });
        });
    }, 300);
    return () => clearTimeout(t);
  }, [needle, tooShort, mode]);

  // An address is worth asking about only once it is shaped like one.
  // Before that the honest state is "still typing", not "free to use" —
  // telling someone an address is available while they are half way
  // through typing it would be wrong more often than right.
  const addr = email.trim().toLowerCase();
  const looksLikeEmail = /.+@.+\..+/.test(addr);
  const emailSeq = useRef(0);

  useEffect(() => {
    if (mode !== 'NEW' || !looksLikeEmail) return;
    const mine = ++emailSeq.current;
    const t = setTimeout(() => {
      checkEmailForTutorAddAction(addr)
        .then((result) => {
          if (emailSeq.current === mine) setCheck({ addr, result });
        })
        .catch(() => {
          if (emailSeq.current === mine) setCheck({ addr, result: null });
        });
    }, 300);
    return () => clearTimeout(t);
  }, [addr, looksLikeEmail, mode]);

  const verdict = check?.addr === addr ? check.result : null;
  const checking = looksLikeEmail && check?.addr !== addr;

  /** The taken-address hatch: hand the found account to the confirm step. */
  function promoteFromVerdict() {
    if (!verdict?.user_id) return;
    setPicked({
      user_id: verdict.user_id,
      name: verdict.name ?? addr,
      email: addr,
      roles: verdict.roles ?? [],
      is_tutor: false,
    });
    setMode('EXISTING');
  }

  function backToChooser() {
    setMode(null);
    setQuery('');
    setHits(null);
    setPicked(null);
    setEmail('');
    setCheck(null);
    setForename('');
    setSurname('');
    setError(null);
  }

  async function confirmPromote() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    const res = await promoteUserToTutorAction(picked.user_id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // A receipt, not "Saved": it names what happened, including the one
    // consequence that could be untrue — the email is QUEUED, never
    // known-delivered, because the send runs after the response.
    onAdded(
      res.emailQueued
        ? `${res.name} is now a tutor — TUTOR granted${res.keptStudent ? ', student account kept' : ''} · welcome email queued`
        : `${res.name} is now a tutor — TUTOR granted${res.keptStudent ? ', student account kept' : ''} · ⚠ the welcome email could not be queued`,
    );
  }

  const canInvite =
    verdict?.verdict === 'none' && forename.trim() !== '' && surname.trim() !== '';

  async function confirmInvite() {
    if (!canInvite || busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set('email', addr);
    fd.set('forename', forename.trim());
    fd.set('surname', surname.trim());
    const res = await inviteTutorByEmailAction(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // ⚠ The email matters MORE here than on the promotion path, so the
    // receipt says so plainly: on this branch the link inside it is the
    // only way into an account that has no password. Still "queued" —
    // the send runs after the response and nothing here knows it landed.
    onAdded(
      res.emailQueued
        ? `${res.name} is now a tutor — account created, TUTOR granted · setup email queued`
        : `${res.name} is now a tutor, but ⚠ the setup email could not be queued — they have no way in until it is re-sent`,
    );
  }

  return (
    <div className="adt-modal-wrap" onClick={onClose}>
      <div
        className="adt-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add tutor"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === null && (
          <>
            <div className="adt-modal-title">Add a tutor</div>
            <p className="adt-modal-sub">
              Two ways in — they need different inputs, so they get different
              forms. Not sure which? Either one will send you to the other.
            </p>
            <div className="adt-modes">
              <button type="button" className="adt-mode" onClick={() => setMode('EXISTING')}>
                <span className="adt-mode-title">Existing user →</span>
                <span className="adt-mode-sub">
                  Already has a MyNclex account — a student, or anyone who
                  registered. Search and pick; we only need their identity.
                </span>
              </button>
              <button type="button" className="adt-mode" onClick={() => setMode('NEW')}>
                <span className="adt-mode-title">New user →</span>
                <span className="adt-mode-sub">
                  No account yet — the common case for a tutor recruited from
                  outside. Needs an email plus a name, because we are creating
                  the record.
                </span>
              </button>
            </div>
            <div className="adt-modal-foot">
              <button type="button" className="btn btn-sm" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === 'EXISTING' && !picked && (
          <>
            <button type="button" className="adt-back" onClick={backToChooser}>
              ‹ Both ways
            </button>
            <div className="adt-modal-title">
              Find an existing user
            </div>
            <p className="adt-modal-sub">
              Search by name or email address.
            </p>
            <input
              className="adt-search"
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or email…"
              aria-label="Search users"
            />

            {tooShort ? (
              // The UI half of the narrow-RPC rule. There is deliberately
              // no empty-state list: this lookup answers "who holds this
              // identity", and never lists everyone.
              <p className="form-hint">
                Type at least two characters. This lookup answers “who holds
                this identity” — it deliberately never lists every user.
              </p>
            ) : hits?.q !== needle ? (
              // Stale or absent results for the CURRENT query means one is
              // in flight — derived, not a flag that can disagree with it.
              <p className="form-hint">Searching…</p>
            ) : hits.rows.length === 0 ? (
              <div className="adt-hatch">
                <span className="adt-hatch-txt">
                  <strong>Not found</strong> — they may never have registered.
                </span>
                <button type="button" className="btn btn-sm" onClick={() => setMode('NEW')}>
                  Invite them instead →
                </button>
              </div>
            ) : (
              <div className="adt-user-list">
                {hits.rows.map((h) => (
                  <button
                    key={h.user_id}
                    type="button"
                    className="adt-user-opt"
                    disabled={h.is_tutor}
                    onClick={() => setPicked(h)}
                  >
                    <span className="ao-tutor-avatar ao-lead-avatar">{initials(h.name)}</span>
                    <span className="adt-cell adt-user-opt-id">
                      <span className="adt-cell-main">{h.name}</span>
                      <span className="adt-cell-sub">{h.email}</span>
                    </span>
                    {/* Already-tutors are shown DISABLED, not hidden: an
                        admin who searches for someone they know exists and
                        sees nothing reads that as a bug. */}
                    <span className="adt-role-chip">
                      {h.is_tutor ? 'ALREADY A TUTOR' : h.roles.length ? h.roles.join(' · ') : 'No roles'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="adt-modal-foot">
              <button type="button" className="btn btn-sm" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === 'EXISTING' && picked && (
          <>
            <button type="button" className="adt-back" onClick={() => setPicked(null)}>
              ‹ Back to search
            </button>
            <div className="adt-modal-title">
              Make {picked.name} a tutor
            </div>
            <p className="adt-modal-sub">
              Effective on their next sign-in — the workspace switcher appears
              automatically once they hold both roles.
            </p>

            {/* The receipt exists because one click writes a row, grants a
                role and sends an email. An admin should not have to read
                the spec to know that. No plan line: tiers are unmodelled
                (§12) and admission is not plan assignment. */}
            <div className="adt-receipt">
              This one action:
              <ul>
                <li>
                  writes an <code>APPROVED</code> row in <code>nclex_tutors</code> — source{' '}
                  <code>ADMIN_PROMOTION</code>, decided by you, now
                </li>
                <li>
                  grants the <code>TUTOR</code> role additively —{' '}
                  {picked.roles.includes('STUDENT')
                    ? 'their student account is kept'
                    : 'their first role'}
                </li>
                <li>
                  sends <code>tutor.added_by_admin</code> to {picked.email}
                </li>
              </ul>
            </div>

            {error && <p className="adt-form-error">{error}</p>}

            <div className="adt-modal-foot">
              <button type="button" className="btn btn-sm" onClick={() => setPicked(null)} disabled={busy}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={confirmPromote}
                disabled={busy}
              >
                {busy ? 'Adding…' : 'Add as tutor'}
              </button>
            </div>
          </>
        )}

        {mode === 'NEW' && (
          <>
            <button type="button" className="adt-back" onClick={backToChooser}>
              ‹ Both ways
            </button>
            <div className="adt-modal-title">Add someone with no account</div>
            <p className="adt-modal-sub">
              We check the address as you type, so you find out before filling
              in anything else.
            </p>

            <input
              className="adt-search"
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="their@email.com"
              aria-label="Email address"
            />

            {/* Four states. The two "taken" ones are NOT errors — they mean
                the wrong branch of the chooser was picked, and each offers
                the way across rather than a dead end. */}
            {!looksLikeEmail ? (
              email.trim().length > 0 ? (
                <div className="adt-verdict is-checking">
                  <span className="adt-verdict-dot" />
                  <span>Checking as you type…</span>
                </div>
              ) : null
            ) : checking ? (
              <div className="adt-verdict is-checking">
                <span className="adt-verdict-dot" />
                <span>Checking as you type…</span>
              </div>
            ) : verdict?.verdict === 'tutor' ? (
              <>
                <div className="adt-verdict is-tutor">
                  <span className="adt-verdict-dot" />
                  <span>Already a tutor on MyNclex.</span>
                </div>
                <div className="adt-hatch">
                  <span className="adt-hatch-txt">
                    <strong>{verdict.name ?? addr}</strong> already holds the
                    TUTOR role, so there is nothing to add.
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => verdict.user_id && onOpenTutor(verdict.user_id)}
                  >
                    Open their record →
                  </button>
                </div>
              </>
            ) : verdict?.verdict === 'user' ? (
              <>
                <div className="adt-verdict is-taken">
                  <span className="adt-verdict-dot" />
                  <span>
                    This email already has an account
                    {verdict.name ? ` — ${verdict.name}` : ''}
                    {verdict.roles?.length ? ` (${verdict.roles.join(' · ')})` : ''}.
                  </span>
                </div>
                <div className="adt-hatch">
                  <span className="adt-hatch-txt">
                    <strong>{verdict.name ?? addr}</strong> already has an
                    account, so there is nothing to create.
                  </span>
                  <button type="button" className="btn btn-accent btn-sm" onClick={promoteFromVerdict}>
                    Promote them instead →
                  </button>
                </div>
              </>
            ) : verdict?.verdict === 'none' ? (
              <>
                <div className="adt-verdict is-free">
                  <span className="adt-verdict-dot" />
                  <span>No account with this email.</span>
                </div>
                {/* ⭐ Slice 3, and it replaced an instruction IN PLACE —
                    the same form, the same branch, no second button. The
                    name fields appear only now, because the address came
                    back free: nobody should fill in a name for an
                    account that turns out to exist. */}
                {/* ⓘ .adt-names and .adt-receipt both already existed,
                    unused — 1c left the grid (and its mobile collapse)
                    behind for this form, the way 1b left the queue's
                    stylesheet for 2b. */}
                <div className="adt-names">
                  <label className="adt-field">
                    <span>First name</span>
                    <input
                      type="text"
                      value={forename}
                      onChange={(e) => setForename(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </label>
                  <label className="adt-field">
                    <span>Last name</span>
                    <input
                      type="text"
                      value={surname}
                      onChange={(e) => setSurname(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </label>
                </div>

                {/* Says what the click does, in the order it happens —
                    the same receipt the promotion path shows, because
                    one click doing four things deserves the same
                    disclosure whichever door it came through. The last
                    line is the one that matters here: no password, so
                    the email is the only way in. */}
                <div className="adt-receipt">
                  This one action:
                  <ul>
                    <li>
                      creates an account for <strong>{addr}</strong> — with no
                      password, so there is nothing to send them separately
                    </li>
                    <li>
                      writes an <code>APPROVED</code> row in <code>nclex_tutors</code> — source{' '}
                      <code>ADMIN_INVITE</code>, decided by you, now
                    </li>
                    <li>
                      grants the <code>TUTOR</code> role and emails a one-time
                      link to set a password
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <p className="form-hint">
                That address could not be checked. Try again in a moment.
              </p>
            )}

            {error && <p className="adt-form-error">{error}</p>}

            <div className="adt-modal-foot">
              <button type="button" className="btn btn-sm" onClick={() => setMode('EXISTING')} disabled={busy}>
                They have registered → search
              </button>
              {/* The invite button exists only on the branch that can use
                  it — a free address. On every other verdict the hatch
                  above is the way forward, and a disabled primary button
                  sitting next to it would just be noise. */}
              {verdict?.verdict === 'none' ? (
                <button
                  type="button"
                  className="btn btn-accent btn-sm"
                  onClick={confirmInvite}
                  disabled={!canInvite || busy}
                  title={canInvite ? undefined : 'Add a first and last name first'}
                >
                  {busy ? 'Inviting…' : 'Invite as tutor'}
                </button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>
                  Close
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
