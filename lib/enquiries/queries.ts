// mynclex/lib/enquiries/queries.ts
//
// Server-side reads for the tutor enquiry queue (Slice 8b). RLS
// (nclex_programme_enquiries_tutor_select) already scopes SELECTs to
// the calling tutor's own programmes via the parent-ownership join,
// so the authed client is enough — no service-role hop needed (unlike
// the roster, which embeds students' profiles).
//
// Misuse → empty list rather than error: a tutor reading a programme
// they don't own gets no rows back, no leak.

import { createClient } from '@/lib/supabase/server';
import type { Enquiry } from './types';

export async function getEnquiriesForProgramme(
  programmeId: string,
): Promise<Enquiry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at, updated_at`,
    )
    .eq('programme_id', programmeId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Enquiry[];
}
