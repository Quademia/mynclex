// mynclex/app/(app)/tutor/profile/page.tsx
//
// Tutor profile page. Today it hosts one section — the public-profile
// editor (slice 3.5), writing nclex_tutors.public_profile.
//
// ⚠ The bag MOVED here from nclex_users in tutor-onboarding slice 1a
// (migration 20260913120000). Identity — name and avatar — stays on
// nclex_users, because every user has those; only the outward-facing
// tutor narrative lives on the tutor record. That split is the doc's
// boundary rule: a field belongs on nclex_tutors only if a non-tutor
// would never need it. Hence the two reads below rather than one.
//
// Private ACCOUNT sections (email, password, contact) remain future
// work and are explicitly NOT part of the tutor arc — see
// docs/product-plan/tutor-onboarding.md §14, which also records that no
// audience can manage their account today.
//
// Server component: loads the tutor's own name + avatar + public_profile
// (RLS scopes both rows to the signed-in user) and hands them to the
// client form.

import { createClient } from '@/lib/supabase/server';
import type { PublicProfile } from '@/lib/discovery/types';
import { PublicProfileForm } from './public-profile-form';

export const dynamic = 'force-dynamic';

export default async function TutorProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // (app) layout already redirects unauthenticated users

  const [{ data }, { data: tutor }] = await Promise.all([
    supabase
      .from('nclex_users')
      .select('name, avatar_url')
      .eq('id', user.id)
      .single(),
    // maybeSingle, not single: a tutor with no record would otherwise
    // throw here. 1a backfilled every existing TUTOR-role holder, so
    // this should not happen — but an empty form beats a crashed page,
    // and actions.ts reports the missing row on save with a message
    // that names the cause.
    supabase
      .from('nclex_tutors')
      .select('public_profile')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const profile = (tutor?.public_profile ?? {}) as PublicProfile;

  return (
    <div className="pf-page">
      <header className="pf-head">
        <h1>Profile</h1>
        <p className="pf-sub">
          Your public profile — what students see on your programme cards and
          detail pages.
        </p>
      </header>

      <PublicProfileForm
        tutorName={data?.name ?? ''}
        avatarUrl={data?.avatar_url ?? null}
        initial={profile}
      />
    </div>
  );
}
