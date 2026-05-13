// mynclex/app/(app)/student/picker/page.tsx
//
// Student landing after login. Two cards: My Programme + Question Bank.
// Card states reflect the student's bank subscription + programme
// enrolment. No auto-redirect into either product — picker is the
// single entry point per the student-nav spec.
//
// NOTE: bank subscription / programme enrolment data is hard-coded
// today. The real tables (nclex_subscriptions, nclex_enrolments) do
// not exist yet — they land with the subscriptions slice. Replace the
// placeholder block below when those tables ship.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { ProgrammeSwitcherTrigger } from '@/components/nav/student/programme-switcher-trigger';

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

  // Placeholder enrolment state — replace with real queries when
  // the subscriptions / enrolments tables land. Slice 10.1 flipped
  // the programme card on by default so the student-curriculum
  // viewer is reachable from the picker without enrolment data;
  // the bookmark message ("Dr Mensah — 8-Week Bootcamp") is
  // replaced with a generic "Browse programmes" line because the
  // picker doesn't know which programme to surface.
  const hasBankSubscription = true;
  const bankDaysLeft = 42;
  const hasProgrammeEnrolment = true;

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
          <div className="picker-grid">
            {hasProgrammeEnrolment ? (
              <ProgrammeSwitcherTrigger
                className="picker-card"
                ariaLabel="Open programme switcher"
              >
                <div className="picker-card-title">My Programmes</div>
                <div className="picker-card-sub">
                  Browse programmes and cohorts you can access
                </div>
              </ProgrammeSwitcherTrigger>
            ) : (
              <Link href="/programmes" className="picker-card empty">
                <div className="picker-card-title">No programme yet</div>
                <div className="picker-card-sub">Browse tutor programmes →</div>
              </Link>
            )}
            <Link href="/student/bank/dashboard" className="picker-card">
              <div className="picker-card-title">Question Bank</div>
              <div className="picker-card-sub">
                {hasBankSubscription
                  ? `Self-study practice · ${bankDaysLeft} days left`
                  : 'Renew to continue practising'}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
