// mynclex/app/(app)/admin/enquiries/page.tsx
//
// Programme Enquiries — admin cross-programme queue (Slice 8c). Read-only
// list of every enquiry across every tutor's programmes. Gated on
// PROGRAMMES_VIEW; SUPER_ADMIN bypass per requireAdminPermission.
//
// Why service-role for the read: PROGRAMMES_VIEW grants page access but
// nclex_programme_enquiries' RLS scopes SELECT to the row's owning tutor
// (or SUPER_ADMIN). A non-super-admin PROGRAMMES_VIEW user reading
// through the authed client would see an empty list. Admin perm-gating
// happens above; the read itself bypasses RLS, same pattern as
// /admin/config (service-role write) and /admin/payments (service-role
// read of cross-user payments).
//
// Status changes (mark Contacted / Closed / notes) intentionally NOT
// surfaced here for v1 — those belong with the owning tutor, on
// /tutor/programme/<id>/enquiries. The admin link in each row hops the
// admin to that tutor surface to take action when needed.

import { requireAdminPermission, PERM_PROGRAMMES_VIEW } from '@/lib/access';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { AdminEnquiriesBoard, type AdminEnquiryRow } from './admin-enquiries-board';
import type { ContactChannel } from '@/lib/discovery/contact-options';
import type { EnquiryStatus } from '@/lib/enquiries/types';

export const dynamic = 'force-dynamic';

export default async function AdminEnquiriesPage() {
  await requireAdminPermission(PERM_PROGRAMMES_VIEW);

  const admin = createServiceRoleClient();
  // Embed programme title + tutor name so each row carries the context
  // a cross-programme view needs. Both are tiny — one round trip.
  const { data } = await admin
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at,
       programme:nclex_programmes!inner(title, tutor:nclex_users!inner(name))`,
    )
    .order('created_at', { ascending: false });

  type RawRow = {
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
    programme:
      | { title: string; tutor: { name: string } | { name: string }[] | null }
      | { title: string; tutor: { name: string } | { name: string }[] | null }[]
      | null;
  };

  const rows: AdminEnquiryRow[] = ((data ?? []) as RawRow[])
    .map((r) => {
      const prog = Array.isArray(r.programme) ? r.programme[0] : r.programme;
      if (!prog) return null;
      const tutor = Array.isArray(prog.tutor) ? prog.tutor[0] : prog.tutor;
      return {
        enquiry_id: r.enquiry_id,
        programme_id: r.programme_id,
        programme_title: prog.title,
        tutor_name: tutor?.name ?? null,
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
      };
    })
    .filter((r): r is AdminEnquiryRow => r !== null);

  return (
    <main className="cfg-page">
      <header className="cfg-head">
        <h1 className="cfg-title">Programme Enquiries</h1>
        <p className="cfg-sub">
          Every contact-form lead across every tutor&apos;s programmes. To
          mark a lead as Contacted / Closed or add notes, open the lead in
          the owning tutor&apos;s programme workspace via the link in its
          row.
        </p>
      </header>

      <AdminEnquiriesBoard rows={rows} />
    </main>
  );
}
