// mynclex/lib/enquiries/actions.ts
//
// Tutor-side status writes for the enquiry queue (Slice 8b):
//   • markContactedAction  — flips NEW → CONTACTED (stamps contacted_at)
//   • markClosedAction     — flips NEW/CONTACTED → CLOSED
//   • saveAdminNotesAction — updates admin_notes
//
// Why service role: nclex_programme_enquiries has tutor SELECT and
// SUPER_ADMIN-ALL policies only — no tutor UPDATE policy, matching the
// established convention (lib/enrolments/actions.ts, waitlist convert/
// dismiss). We gate ownership with the AUTHED client first (RLS SELECT
// returns the enquiry only if the caller owns its parent programme),
// then run the UPDATE under the service role.
//
// CONVERTED is NOT settable from this surface — it's an auto-stamp from
// Slice 8c when an enrolment lands with a matching email. A tutor who
// marks an enquiry Closed after the student has already enrolled
// elsewhere isn't a problem (Closed and Converted are both terminal).

'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { Enquiry, EnquiryStatus } from './types';

export type EnquiryActionResult = { ok: true } | { ok: false; error: string };

// Returns the enquiry row only if the caller owns its parent programme.
// RLS does the heavy lifting; we just convert "no row" into a friendly
// error message at the call site.
async function readOwnedEnquiry(
  enquiryId: string,
): Promise<Enquiry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at, updated_at`,
    )
    .eq('enquiry_id', enquiryId)
    .maybeSingle();
  return (data as Enquiry | null) ?? null;
}

async function updateEnquiry(
  enquiryId: string,
  patch: Record<string, unknown>,
): Promise<EnquiryActionResult> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from('nclex_programme_enquiries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('enquiry_id', enquiryId);
  if (error) return { ok: false, error: error.message };
  // Enquiries now live only on the global inbox (the per-programme tab is a
  // redirect shim). Refresh it so the list + the nav badge re-derive.
  revalidatePath('/tutor/enquiries');
  return { ok: true };
}

export async function markContactedAction(
  enquiryId: string,
): Promise<EnquiryActionResult> {
  const enquiry = await readOwnedEnquiry(enquiryId);
  if (!enquiry) return { ok: false, error: 'Enquiry not found or not yours.' };
  if (enquiry.status !== 'NEW') {
    return { ok: false, error: 'Only new enquiries can be marked as contacted.' };
  }
  return updateEnquiry(enquiryId, {
    status: 'CONTACTED' as EnquiryStatus,
    contacted_at: new Date().toISOString(),
  });
}

export async function markClosedAction(
  enquiryId: string,
): Promise<EnquiryActionResult> {
  const enquiry = await readOwnedEnquiry(enquiryId);
  if (!enquiry) return { ok: false, error: 'Enquiry not found or not yours.' };
  if (enquiry.status === 'CONVERTED' || enquiry.status === 'CLOSED') {
    return { ok: false, error: 'This enquiry is already closed.' };
  }
  return updateEnquiry(enquiryId, { status: 'CLOSED' as EnquiryStatus });
}

export async function saveAdminNotesAction(
  enquiryId: string,
  notes: string,
): Promise<EnquiryActionResult> {
  const enquiry = await readOwnedEnquiry(enquiryId);
  if (!enquiry) return { ok: false, error: 'Enquiry not found or not yours.' };
  const trimmed = notes.trim();
  return updateEnquiry(enquiryId, { admin_notes: trimmed === '' ? null : trimmed });
}
