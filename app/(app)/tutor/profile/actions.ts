// mynclex/app/(app)/tutor/profile/actions.ts
//
// Server action for the tutor public-profile editor. Writes the
// public_profile JSONB bag on the tutor's own nclex_tutors row.
//
// ⚠ The bag MOVED here from nclex_users in tutor-onboarding slice 1a
// (migration 20260913120000).
//
// ⭐ THREE LAYERS GUARD THIS WRITE, and the middle one is new to this
// table. nclex_tutors holds `status` — the column that decides whether
// someone is an approved tutor — so a whole-row self-update, which was
// harmless on nclex_users, would here let a tutor run
// `update({ status: 'APPROVED' })` on their own row and approve
// themselves, or lift their own suspension.
//   1. this action sends ONLY the cleaned bag (below);
//   2. a COLUMN-level grant — UPDATE is revoked on the table and handed
//      back for public_profile + updated_at alone, so the database
//      refuses anything else whatever a client sends;
//   3. RLS (nclex_tutors_self_update) restricts the ROW to
//      user_id = auth.uid(), and we scope .eq() here too so the policy
//      check is belt-and-braces.
// Status transitions belong exclusively to the admin actions in slices
// 1c/1d, under TUTORS_MANAGE.
//
// public_profile is PUBLIC-display data by rule — no private fields
// ever land in this bag. It is the one column on nclex_tutors that
// strangers read, through the nclex_public_programmes view.
//
// The action sanitises into a clean bag: strings trimmed, empties
// dropped, years coerced to a positive integer. Storing dropped-empty
// keys (rather than empty strings) keeps the JSONB tidy and lets the
// render side treat "absent" and "blank" identically.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { PublicProfile } from '@/lib/discovery/types';

export type SaveProfileResult = { ok: true } | { ok: false; error: string };

function clean(input: PublicProfile): PublicProfile {
  const profile: PublicProfile = {};
  const str = (v: string | undefined): string | undefined => {
    const t = (v ?? '').trim();
    return t.length ? t : undefined;
  };

  const headline = str(input.headline);
  if (headline) profile.headline = headline;

  const speciality = str(input.speciality);
  if (speciality) profile.speciality = speciality;

  if (
    input.years_experience != null &&
    Number.isInteger(input.years_experience) &&
    input.years_experience > 0
  ) {
    profile.years_experience = input.years_experience;
  }

  const bio = str(input.bio);
  if (bio) profile.bio = bio;

  const businessName = str(input.business_name);
  if (businessName) profile.business_name = businessName;

  const businessLogo = str(input.business_logo_url);
  if (businessLogo) profile.business_logo_url = businessLogo;

  const businessBio = str(input.business_bio);
  if (businessBio) profile.business_bio = businessBio;

  return profile;
}

export async function savePublicProfileAction(
  input: PublicProfile
): Promise<SaveProfileResult> {
  if (
    input.years_experience != null &&
    (!Number.isInteger(input.years_experience) || input.years_experience < 0)
  ) {
    return { ok: false, error: 'Years tutoring must be a whole number.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // updated_at explicitly: this repo has no updated_at triggers, every
  // write path sets it (see the 1.12a migration header).
  const { data, error } = await supabase
    .from('nclex_tutors')
    .update({ public_profile: clean(input), updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('user_id');

  if (error) {
    return { ok: false, error: error.message ?? 'Failed to save profile.' };
  }

  // An UPDATE that matches nothing is not an error to PostgREST, so a
  // tutor with no nclex_tutors row would otherwise see "Saved" and lose
  // their work silently. 1a backfilled every TUTOR-role holder, so this
  // means something is genuinely wrong rather than merely unset — and a
  // distinct message makes that one click to diagnose instead of a hunt.
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        'Your tutor record is missing, so there was nothing to save. Please contact support.',
    };
  }

  revalidatePath('/tutor/profile');
  revalidatePath('/programmes');
  return { ok: true };
}
