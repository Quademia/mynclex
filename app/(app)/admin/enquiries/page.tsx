// mynclex/app/(app)/admin/enquiries/page.tsx
//
// Programme Enquiries — admin operations dashboard (Slice 8 UI rebuild,
// V1 ops). Cross-programme operational view: KPI strip + tutor SLA
// scoreboard + channel mix + filterable table. Gated on PROGRAMMES_VIEW;
// SUPER_ADMIN bypass via requireAdminPermission.
//
// Why service-role for the read: PROGRAMMES_VIEW grants page access but
// nclex_programme_enquiries' RLS scopes SELECT to the row's owning
// tutor (or SUPER_ADMIN). A non-super-admin PROGRAMMES_VIEW user reading
// through the authed client would see an empty list. Admin perm-gating
// happens above; the read itself bypasses RLS.
//
// Aggregations are pure TS on the fetched rows (computeAdminStats from
// lib/enquiries/aggregations) — one DB round trip; everything the
// dashboard renders derives from the same row list. Sparklines bucket
// the 8 trailing weeks; tutor scoreboard groups by tutor_name.
//
// Status changes (mark Contacted / Closed / notes) intentionally NOT
// surfaced here — those belong on /tutor/programme/<id>/enquiries.
// Each row's "Open in tutor view ↗" link hops the admin there.

import { requireAdminPermission, PERM_PROGRAMMES_VIEW } from '@/lib/access';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeAdminStats,
  type AdminAggregationRow,
} from '@/lib/enquiries/aggregations';
import { AdminEnquiriesBoard, type AdminEnquiryRow } from './admin-enquiries-board';
import type { ContactChannel } from '@/lib/discovery/contact-options';
import type { EnquiryStatus } from '@/lib/enquiries/types';

export const dynamic = 'force-dynamic';

export default async function AdminEnquiriesPage() {
  await requireAdminPermission(PERM_PROGRAMMES_VIEW);

  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('nclex_programme_enquiries')
    .select(
      `enquiry_id, programme_id, name, email, phone, preferred_contact,
       message, status, contacted_at, converted_enrolment_id,
       admin_notes, created_at, updated_at,
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
    updated_at: string;
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

  // Shape the aggregator wants — pares the row down to just the fields
  // it reads, so future row-shape changes don't surprise the aggregator.
  const aggregationRows: AdminAggregationRow[] = rows.map((r) => ({
    status: r.status,
    created_at: r.created_at,
    contacted_at: r.contacted_at,
    preferred_contact: r.preferred_contact,
    tutor_name: r.tutor_name,
  }));
  const stats = computeAdminStats(aggregationRows);

  return (
    <main className="ao-page">
      <header className="ao-page-head">
        <h1 className="ao-page-title">Programme enquiries</h1>
        <p className="ao-page-sub">
          Every lead across every tutor&apos;s programmes. Status changes
          happen in the tutor&apos;s workspace — admin sees aggregate health
          and can hop to any specific lead.
        </p>
      </header>

      <AdminEnquiriesBoard rows={rows} stats={stats} />
    </main>
  );
}
