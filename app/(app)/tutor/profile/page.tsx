// mynclex/app/(app)/tutor/profile/page.tsx
//
// Tutor profile page. Today it hosts one section — the public-profile
// editor (slice 3.5), writing nclex_users.public_profile. Private
// account sections (email, password, contact) are separate future work
// on their own columns; this page is the eventual home for all of them.
//
// Server component: loads the tutor's own name + avatar + public_profile
// (RLS scopes the row to the signed-in user) and hands them to the
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

  const { data } = await supabase
    .from('nclex_users')
    .select('name, avatar_url, public_profile')
    .eq('id', user.id)
    .single();

  const profile = (data?.public_profile ?? {}) as PublicProfile;

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
