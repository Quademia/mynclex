// mynclex/lib/enquiries/types.ts
//
// Shapes for the tutor-side enquiry queue (Slice 8b). The DB table
// nclex_programme_enquiries is defined in 20260613120000_slice_8a_*.sql;
// these types are the projection the tutor surface reads.
//
// Public-side submission (Slice 8a) doesn't share these — it goes
// directly to nclex_submit_enquiry RPC via FormData, no typed payload.
//
// ─────────────────────────────────────────────────────────────────
// Scope note (2026-05-24)
// ─────────────────────────────────────────────────────────────────
// This module currently covers PROGRAMME enquiries only — leads from
// the public Contact form on a programme's detail page. The name
// `lib/enquiries/` is deliberately programme-scoped despite the
// generic name, matching the rest of the codebase's "name by concept,
// not by parent" convention (see lib/enrolments/, lib/cohorts/,
// lib/strategies/).
//
// If a SECOND enquiry shape ever appears (general "Contact QAcademy"
// support, institutional sales, etc.), the split plan is:
//
//   lib/enquiries/
//     shared/    ← EnquiryStatus, format helpers (statusPill,
//                  urgencyTier, formatEnquiryDateTime),
//                  saveAdminNotesAction (works on any table)
//     programme/ ← everything currently in this folder
//     <new>/     ← parallel structure for the new type
//
// DB tables don't move (nclex_programme_enquiries is already
// correctly prefixed; the second type lives alongside as e.g.
// nclex_general_enquiries). Refactor cost when it happens: ~1-2 hrs.
// Don't pre-split — wait for the second concrete type so the right
// shared/per-type cut becomes visible.

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

// The same row plus its parent programme's title — the shape the GLOBAL
// tutor enquiries inbox reads (leads across every programme, with a
// programme column + filter). The per-programme page uses the bare Enquiry
// (it already knows which programme it's in).
export type EnquiryWithProgramme = Enquiry & { programme_title: string };
