// mynclex/app/(app)/student/picker/page.tsx
//
// Student landing after login. The home base: a "Your programmes"
// section listing the programmes the student is enrolled in (with
// status), and a "Question Bank" section. No auto-redirect into either
// product — the picker is the single entry point per the student-nav
// spec.
//
// Programmes are listed INLINE here (via <ProgrammeList>), not behind
// the switcher popup — the popup is now only for switching while
// already inside a programme. Same data + row rendering as the popup,
// so enrolment gating shows identically: ENROLLED rows are enterable,
// every other status is dimmed with its pill + reason.
//
// The bank card reflects real bank access (Slice 5.6): active → enters the
// bank with "X days left"; none/lapsed → a "Get access" CTA pointing at
// /bank-access (since full-lock means the bank dashboard would only bounce
// a sub-less student).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { Footer } from '@/components/shell/footer';
import { ProgrammeCards } from '@/components/nav/student/programme-cards';
import { getMyAccessibleProgrammesAction } from '@/lib/programmes/student-actions';
import { getMyBankAccess } from '@/lib/payments/entitlements';
import { getMyCredits } from '@/lib/payments/readiness-credits-read';
import { loadMyTutorRecord } from '@/lib/tutors/queries';
import { TUTOR_APPLICATION_PATH } from '@/lib/tutors/types';

export const dynamic = 'force-dynamic';

export default async function PickerPage() {
  const chrome = await loadChromeData();
  if (!chrome.roles.includes('STUDENT')) redirect('/no-access');

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('nclex_users')
    .select('forename')
    .eq('id', chrome.userId)
    .maybeSingle();
  const firstName = profile?.forename ?? 'there';

  // Enrolled programmes — RLS narrows this to the student's own
  // enrolments (any status); ENROLLED ones are enterable.
  const { programmes } = await getMyAccessibleProgrammesAction();

  const bankAccess = await getMyBankAccess();
  const bankHref = bankAccess.active ? '/student/bank/dashboard' : '/bank-access';
  // The rail shows the access state prominently when active; when there's
  // no access the CTA ("Get access") carries it, so the status line hides.
  const bankStatusLine = bankAccess.active
    ? bankAccess.lifetime
      ? 'Lifetime access'
      : `${bankAccess.daysLeft} day${bankAccess.daysLeft === 1 ? '' : 's'} left`
    : null;
  const bankCtaLabel = bankAccess.active ? 'Open the bank' : 'Get access';

  // Readiness door: ALWAYS shown (grouped with the bank rail, not a co-equal
  // third product — 2026-07-09 IA decision). Owners (a non-revoked credit —
  // claimed, running, sat, or waiting to be claimed) go to their packs page;
  // a logged-in student with no credits gets a sell-state door pointing at the
  // public /readiness page, so they can discover + buy rather than being shown
  // nothing.
  const credits = await getMyCredits();
  const ownsReadiness = credits.total - credits.byStage.REVOKED > 0;
  const readinessLine =
    credits.byStage.UNCLAIMED > 0
      ? `${credits.byStage.UNCLAIMED} credit${credits.byStage.UNCLAIMED === 1 ? '' : 's'} ready to claim`
      : credits.byStage.ACTIVE > 0
        ? `${credits.byStage.ACTIVE} window${credits.byStage.ACTIVE === 1 ? '' : 's'} open`
        : ownsReadiness
          ? 'Your one-shot mock exams — claim, activate, sit.'
          : 'A curated, one-shot mock built like the real NCLEX. Sit it once for a formal readiness score — a true measure of where you stand, not just more practice.';

  // ⭐ §8B of tutor-onboarding: an existing STUDENT who applies to teach
  // keeps their student access and lands here as usual, so this is the
  // one place they would ever learn their application exists.
  //
  // ⚠ A POINTER, NOT A COPY. The status, the reason and the resubmit form
  // all live on /for-tutors/apply; duplicating any of it here would give
  // two answers to one question. This card says "there is a thing, it is
  // here" and nothing more.
  //
  // ⓘ Shown only while it is unresolved or refused. An APPROVED applicant
  // holds the TUTOR role and has a role switch in the topbar, so a card
  // telling them about an application would be describing the past.
  const tutorApplication = await loadMyTutorRecord();
  const showApplicationCard =
    tutorApplication?.status === 'PENDING' || tutorApplication?.status === 'REJECTED';

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· MyNclex"
    >
      <div className="picker">
        <div className="picker-inner">
          <div className="picker-greeting">Welcome back, {firstName}</div>
          <div className="picker-sub">Where would you like to go?</div>

          {showApplicationCard && tutorApplication && (
            <Link href={TUTOR_APPLICATION_PATH} className="picker-tutor-app">
              <span className="picker-tutor-app-label">
                {tutorApplication.status === 'PENDING'
                  ? `Tutor application — pending · Request #${tutorApplication.submission_count}`
                  : 'Tutor application — we could not take you on this time'}
              </span>
              <span className="picker-tutor-app-cta">
                {tutorApplication.status === 'PENDING'
                  ? 'View'
                  : 'See why, and resubmit'}{' '}
                →
              </span>
            </Link>
          )}

          <div className="picker-rails">
            {/* Programmes lane */}
            <div className="picker-lane">
              <h2 className="picker-lane-title">Your programmes</h2>
              {programmes.length > 0 ? (
                <ProgrammeCards programmes={programmes} />
              ) : (
                <div className="pcard pcard-empty-state">
                  <div className="pcard-title">No programmes yet</div>
                  <p className="pcard-tagline">
                    When you enrol in a programme, it&apos;ll show up here.
                  </p>
                </div>
              )}
            </div>

            {/* Self-study side column: the constant Question Bank rail, and
                — for readiness owners — a door to their packs below it. */}
            <div className="picker-side">
              <aside className="picker-bank-rail">
                <div className="bank-rail-eyebrow">Question Bank</div>
                <div className="bank-rail-title">Practise &amp; rehearse</div>
                {bankStatusLine && (
                  <div className="bank-rail-status">{bankStatusLine}</div>
                )}
                <p className="bank-rail-desc">
                  Thousands of NCLEX-style questions with full rationales —
                  learn by topic, or rehearse exam day with timed and
                  CAT-adaptive modes. Unlimited, at your pace.
                </p>
                <Link href={bankHref} className="bank-rail-cta">
                  {bankCtaLabel} <span aria-hidden="true">→</span>
                </Link>
              </aside>

              <aside className="picker-bank-rail picker-readiness-rail">
                <div className="bank-rail-eyebrow">Readiness Packs</div>
                <div className="bank-rail-title">Test your readiness</div>
                <p className="bank-rail-desc">{readinessLine}</p>
                <Link
                  href={ownsReadiness ? '/student/bank/packs' : '/readiness'}
                  className="bank-rail-cta"
                >
                  {ownsReadiness ? 'View your packs' : 'Get readiness packs'}{' '}
                  <span aria-hidden="true">→</span>
                </Link>
              </aside>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </AppShell>
  );
}
