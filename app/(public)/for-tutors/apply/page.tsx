// mynclex/app/(public)/for-tutors/apply/page.tsx
//
// ONE ROUTE, FIVE STATES — tutor-onboarding sub-slice 2a-i.
// Plan: docs/product-plan/tutor-onboarding.md §8 (the state table), §9
// (re-application), §5 (the routing rule).
//
// ⭐ THE FORM AND THE STATUS PAGE ARE THE SAME PAGE (settled with Sam,
// 2026-08-22). Earlier drafts had them as two surfaces. They cannot be:
// this route has to read the caller's record before it can render
// anything — that is how the SUSPENDED refusal works — and once it is
// doing that, the form is simply the state it shows when it finds no row.
// Resubmission stops being a screen and becomes the REJECTED state.
//
// ⚠ SCOPE — 2a-i IS SIGNED-IN ONLY. A logged-out visitor is sent to sign
// in and brought back here. The email-first step, the "you already have
// an account" bounce and account creation are 2a-ii, which is sequenced
// last because it is the first thing that creates ROLE-LESS applicants,
// and they need 2c's router split before they have anywhere to stand.
//
// ⓘ It lives in (public) rather than (app) because it must be reachable
// by somebody with no roles at all — (app)'s layouts assume an audience,
// and an applicant does not have one yet. Route groups do not affect the
// URL, so this is still /for-tutors/apply, which is what
// TUTOR_APPLICATION_PATH and the rejection email both point at.

// ⓘ No `redirect` any more: 2a-ii replaced the logged-out bounce with
// the guest form, so nothing on this route sends anybody away.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadMyTutorRecord } from '@/lib/tutors/queries';
import { ApplyForm } from './apply-form';
import { ConvertOffer } from './convert-offer';
import { GuestApply } from './guest-apply';

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function ApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ⭐ 2a-ii. This used to redirect to /login — 2a-i's plain gate. It now
  // shows the same door a signed-in person sees: one form, and whether we
  // create an account or send them to sign in is decided by the EMAIL
  // they type, not by the fact that they arrived logged out (§5).
  if (!user) {
    return (
      <main className="ft-page ft-narrow">
        <div className="ft-state">
          <h1 className="ft-state-title">Apply to teach on MyNclex</h1>
          <p className="ft-state-body">
            Tell us who you are and how you would teach. We review every
            application and email you either way.
          </p>
        </div>
        <GuestApply />
      </main>
    );
  }

  const record = await loadMyTutorRecord();

  // For the rejection branch's conversion offer (§8). Read here rather
  // than inside the component so the button never renders for somebody
  // who already holds the role.
  const { data: roleRows } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);
  const alreadyStudent = (roleRows ?? []).some((r) => r.role === 'STUDENT');

  // ── APPROVED — nothing to apply for ────────────────────────────────
  if (record?.status === 'APPROVED') {
    return (
      <main className="ft-page ft-narrow">
        <div className="ft-state">
          <h1 className="ft-state-title">You are already a tutor</h1>
          <p className="ft-state-body">
            Your tutor workspace is open. There is no application to make.
          </p>
          <Link href="/tutor" className="ft-cta">
            Open your tutor workspace
          </Link>
        </div>
      </main>
    );
  }

  // ── SUSPENDED — refused, and the refusal is the point ──────────────
  //
  // §6: the only arrow into PENDING is from REJECTED. Letting a suspended
  // tutor re-apply would let them sit in the queue as an ordinary
  // applicant and be re-approved by an admin who does not read the
  // history. The RPC refuses this too — that is the enforcement, this is
  // the courtesy of saying so rather than failing on submit.
  //
  // ⓘ Telling THEM discloses nothing new: 1d settled that a tutor can
  // read their own row, and reasons are written knowing the subject will.
  if (record?.status === 'SUSPENDED') {
    return (
      <main className="ft-page ft-narrow">
        <div className="ft-state">
          <h1 className="ft-state-title">Your tutor account is suspended</h1>
          <p className="ft-state-body">
            A new application cannot be submitted while a suspension is in
            place.
          </p>
          {record.decision_reason && (
            <div className="ft-reason">
              <div className="ft-reason-label">Reason given</div>
              {record.decision_reason}
            </div>
          )}
          <p className="ft-state-body">
            If you think this is a mistake, or you would like to discuss it,
            reply to the email we sent you and it will reach us.
          </p>
        </div>
      </main>
    );
  }

  // ── PENDING — waiting on us ────────────────────────────────────────
  if (record?.status === 'PENDING') {
    return (
      <main className="ft-page ft-narrow">
        <div className="ft-state">
          <span className="ft-badge">Request #{record.submission_count}</span>
          <h1 className="ft-state-title">Your application is with us</h1>
          <p className="ft-state-body">
            We will email you once a decision has been made — whichever way
            it goes.
          </p>
          <dl className="ft-kv">
            <dt>Submitted</dt>
            <dd>{formatDate(record.last_applied_at) ?? '—'}</dd>
            {record.organisation && (
              <>
                <dt>Organisation</dt>
                <dd>{record.organisation}</dd>
              </>
            )}
          </dl>
          {record.request_note && (
            <div className="ft-note">
              <div className="ft-reason-label">What you told us</div>
              {record.request_note}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── REJECTED — not terminal (§6, §9) ───────────────────────────────
  //
  // The reason is shown deliberately: §9 keeps decision_reason precisely
  // so somebody re-applying knows what to fix, and the form below arrives
  // PRE-FILLED so they are not retyping everything to change one thing.
  if (record?.status === 'REJECTED') {
    return (
      <main className="ft-page ft-narrow">
        <div className="ft-state">
          <h1 className="ft-state-title">We could not take you on this time</h1>
          <p className="ft-state-body">
            Reviewed {formatDate(record.decided_at) ?? 'recently'}. This is
            not final — you can update your details below and send the
            application back to us.
          </p>
          {record.decision_reason && (
            <div className="ft-reason">
              <div className="ft-reason-label">Reason given</div>
              {record.decision_reason}
            </div>
          )}
        </div>

        <ApplyForm
          mode="RESUBMIT"
          initialOrganisation={record.organisation ?? ''}
          initialNote={record.request_note ?? ''}
          nextSubmissionCount={record.submission_count + 1}
        />

        {/* ⭐ A rejection should not be a dead end (§8). Offered only to
            someone who does NOT already hold the role — a rejected
            applicant who was our student all along has nothing to accept,
            and showing them a button that grants what they have would be
            an offer with no content. */}
        {!alreadyStudent && <ConvertOffer />}
      </main>
    );
  }

  // ── No row — the form, blank ───────────────────────────────────────
  return (
    <main className="ft-page ft-narrow">
      <div className="ft-state">
        <h1 className="ft-state-title">Apply to teach on MyNclex</h1>
        <p className="ft-state-body">
          Tell us who you are and how you would teach. We review every
          application and email you either way.
        </p>
      </div>

      <ApplyForm
        mode="NEW"
        initialOrganisation=""
        initialNote=""
        nextSubmissionCount={1}
      />
    </main>
  );
}
