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

  // Readiness door: shown when the student owns readiness (a non-revoked
  // credit — claimed, running, sat, or waiting to be claimed). It's their
  // only hub route to the packs page if they hold no bank pass, and a
  // convenient shortcut if they do. Grouped with the bank rail, not a
  // co-equal third product (2026-07-09 IA decision).
  const credits = await getMyCredits();
  const ownsReadiness = credits.total - credits.byStage.REVOKED > 0;
  const readinessLine =
    credits.byStage.UNCLAIMED > 0
      ? `${credits.byStage.UNCLAIMED} credit${credits.byStage.UNCLAIMED === 1 ? '' : 's'} ready to claim`
      : credits.byStage.ACTIVE > 0
        ? `${credits.byStage.ACTIVE} window${credits.byStage.ACTIVE === 1 ? '' : 's'} open`
        : 'Your one-shot mock exams — claim, activate, sit.';

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
                <div className="bank-rail-title">Self-study practice</div>
                {bankStatusLine && (
                  <div className="bank-rail-status">{bankStatusLine}</div>
                )}
                <p className="bank-rail-desc">
                  Thousands of NCLEX-style questions. Practise any time — no
                  schedule, no cohort.
                </p>
                <Link href={bankHref} className="bank-rail-cta">
                  {bankCtaLabel} <span aria-hidden="true">→</span>
                </Link>
              </aside>

              {ownsReadiness && (
                <aside className="picker-bank-rail picker-readiness-rail">
                  <div className="bank-rail-eyebrow">Readiness Packs</div>
                  <div className="bank-rail-title">Your mock exams</div>
                  <p className="bank-rail-desc">{readinessLine}</p>
                  <Link href="/student/bank/packs" className="bank-rail-cta">
                    View your packs <span aria-hidden="true">→</span>
                  </Link>
                </aside>
              )}
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </AppShell>
  );
}
