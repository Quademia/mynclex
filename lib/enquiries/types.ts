// mynclex/lib/enquiries/types.ts
//
// Shapes for the tutor-side enquiry queue (Slice 8b). The DB table
// nclex_programme_enquiries is defined in 20260613120000_slice_8a_*.sql;
// these types are the projection the tutor surface reads.
//
// Public-side submission (Slice 8a) doesn't share these — it goes
// directly to nclex_submit_enquiry RPC via FormData, no typed payload.

import type { ContactChannel } from '@/lib/discovery/contact-options';

// Slice 8b — "Contacted" replaced "Forwarded": tutor-perspective name for
// the action the button records (the *tutor* contacted the student),
// vs the original platform-perspective phrasing.
export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED';

export type Enquiry = {
  enquiry_id: string;
  programme_id: string;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact: ContactChannel[];
  message: string | null;
  status: EnquiryStatus;
  contacted_at: string | null;
  converted_enrolment_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};
