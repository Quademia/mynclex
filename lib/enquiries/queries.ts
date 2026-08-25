// mynclex/lib/enquiries/queries.ts
//
// Server-side reads for the tutor enquiry queue (Slice 8b). The authed
// client is enough — no service-role hop needed (unlike the roster,
// which embeds students' profiles).
//
// ⓘ This table came out of the 2026-08-25 RLS sweep BETTER than the
// rest: nclex_programme_enquiries carries only _tutor_select (owner,
// via the parent-programme join) and _admin_all. No student policy, no
// public policy — so "RLS scopes SELECT to the calling tutor", which
// was false almost everywhere else, was true here. One tutor could
// never read another's leads.
//
// ⚠ The one hole was _admin_all being FOR ALL while the SUPER_ADMIN
// account also holds TUTOR: on dev that account owns ZERO programmes
// and this inbox showed it ALL 11 enquiries — 11 people's names,
// emails and phone numbers — as "your leads". Every read below now
// names its owner through the parent programme.
//
// Misuse → empty list rather than error: a tutor reading a programme
// they don't own gets no rows back, no leak.

import { createClient } from '@/lib/supabase/server';
import { getProgrammeTutorId } from '@/lib/programmes/tutor-scope';
import type { Enquiry, EnquiryWithProgramme } from './types';

// ⓘ Owner-filtered through the parent programme for the same reason as
// getEnquiriesForTutor below — RLS genuinely scopes this to the owning
// tutor, but _admin_all is FOR ALL, and these counts feed TUTOR home /
// programme-overview cards. See lib/programmes/tutor-scope.ts.
export async function getEnquiriesForProgramme(
  programmeId: string,
): Promise<Enquiry[]> {
  const tutorId = await getProgrammeTutorId();
  if (!tutorId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at, updated_at,
       programme:nclex_programmes!inner(tutor_id)`,
    )
    .eq('programme_id', programmeId)
    .eq('programme.tutor_id', tutorId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Enquiry[];
}

// Every enquiry across the calling tutor's OWN programmes, newest first —
// the global /tutor/enquiries inbox.
//
// ⓘ This table is the RARE one where "RLS scopes it" was TRUE:
// nclex_programme_enquiries carries only _tutor_select (owner, via the
// parent programme) and _admin_all. There is no student policy and no
// public policy, so the union problem swept elsewhere on 2026-08-25
// does not apply — a tutor genuinely cannot read another tutor's leads.
//
// ⚠ But _admin_all is FOR ALL, and the SUPER_ADMIN account also holds
// TUTOR. Measured on dev: signed in as SUPER_ADMIN — who owns ZERO
// programmes — this inbox listed ALL 11 enquiries across 2 tutors,
// 11 people's names, emails and phone numbers, framed as "your leads".
// The explicit owner filter closes that, matching the call already made
// for the library (2026-08-25) and the programme surfaces: admin
// oversight belongs on /admin/*, not on a tutor screen headed "your
// enquiries". See lib/programmes/tutor-scope.ts.
export async function getEnquiriesForTutor(): Promise<EnquiryWithProgramme[]> {
  const tutorId = await getProgrammeTutorId();
  if (!tutorId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at, updated_at,
       programme:nclex_programmes!inner(title)`,
    )
    .eq('programme.tutor_id', tutorId)
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

// Count of NEW (untouched) enquiries across the tutor's own programmes —
// the "unread" badge on the global Enquiries nav item. `head: true`
// fetches the count with no rows. Returns 0 on error so a hiccup never
// blocks the shell from rendering.
//
// ⚠ Owner-filtered for the same reason as the list it badges — without
// it a SUPER_ADMIN's badge counted every tutor's new leads.
// See lib/programmes/tutor-scope.ts.
export async function getNewEnquiryCountForTutor(): Promise<number> {
  const tutorId = await getProgrammeTutorId();
  if (!tutorId) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from('nclex_programme_enquiries')
    .select('enquiry_id, programme:nclex_programmes!inner(tutor_id)', {
      count: 'exact',
      head: true,
    })
    .eq('programme.tutor_id', tutorId)
    .eq('status', 'NEW');

  if (error || count == null) return 0;
  return count;
}
