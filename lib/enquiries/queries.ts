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
import type { Enquiry, EnquiryWithProgramme } from './types';

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

// Every enquiry across the calling tutor's OWN programmes, newest first —
// the global /tutor/enquiries inbox. RLS
// (nclex_programme_enquiries_tutor_select) already scopes SELECT to the
// tutor's owned programmes, so the authed client returns exactly their
// leads — no programme filter, no service-role hop. The `!inner` programme
// join adds the title for the programme column + filter (and is itself
// RLS-scoped to the tutor's own programmes).
export async function getEnquiriesForTutor(): Promise<EnquiryWithProgramme[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at, updated_at,
       programme:nclex_programmes!inner(title)`,
    )
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  type Raw = Enquiry & {
    programme: { title: string } | { title: string }[] | null;
  };
  return (data as Raw[]).map((r) => {
    const prog = Array.isArray(r.programme) ? r.programme[0] : r.programme;
    return {
      enquiry_id: r.enquiry_id,
      programme_id: r.programme_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      preferred_contact: r.preferred_contact,
      message: r.message,
      status: r.status,
      contacted_at: r.contacted_at,
      converted_enrolment_id: r.converted_enrolment_id,
      admin_notes: r.admin_notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      programme_title: prog?.title ?? '—',
    };
  });
}
