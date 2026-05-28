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
import { ProgrammeList } from '@/components/nav/student/programme-list';
import { getMyAccessibleProgrammesAction } from '@/lib/programmes/student-actions';
import { getMyBankAccess } from '@/lib/payments/entitlements';

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
  const bankSubLine = bankAccess.active
    ? bankAccess.lifetime
      ? 'Lifetime access'
      : `${bankAccess.daysLeft} day${bankAccess.daysLeft === 1 ? '' : 's'} left`
    : 'Get access →';

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

          <section className="picker-section">
            <h2 className="picker-section-title">Your programmes</h2>
            {programmes.length > 0 ? (
              <ProgrammeList programmes={programmes} />
            ) : (
              <div className="picker-card empty is-disabled" aria-disabled="true">
                <div className="picker-card-title">No programmes yet</div>
                <div className="picker-card-sub">
                  Browse programmes — coming soon
                </div>
              </div>
            )}
          </section>

          <section className="picker-section">
            <h2 className="picker-section-title">Question Bank</h2>
            <Link href={bankHref} className="picker-card">
              <div className="picker-card-title">Self-study practice</div>
              <div className="picker-card-sub">{bankSubLine}</div>
            </Link>
          </section>
        </div>
        <Footer />
      </div>
    </AppShell>
  );
}
