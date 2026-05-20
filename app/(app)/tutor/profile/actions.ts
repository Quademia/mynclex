// mynclex/app/(app)/tutor/profile/actions.ts
//
// Server action for the tutor public-profile editor. Writes the
// public_profile JSONB bag on the tutor's own nclex_users row.
//
// RLS (nclex_users_self_update) already restricts UPDATE to
// id = auth.uid(); we also scope the .eq('id', user.id) here so the
// policy check is belt-and-braces. public_profile is PUBLIC-display
// data by rule — no private fields ever land in this bag.
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

  const { error } = await supabase
    .from('nclex_users')
    .update({ public_profile: clean(input) })
    .eq('id', user.id);

  if (error) {
    return { ok: false, error: error.message ?? 'Failed to save profile.' };
  }

  revalidatePath('/tutor/profile');
  revalidatePath('/programmes');
  return { ok: true };
}
