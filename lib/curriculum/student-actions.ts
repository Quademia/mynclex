// mynclex/lib/curriculum/student-actions.ts
//
// Student-side curriculum server actions — called from the
// per-type activity viewers (client components) on demand.
// Separate from actions.ts (tutor authoring) per the audience-
// grouped convention, mirroring lib/programmes/student-actions.ts.
//
// getStudentPdfActivityUrl (slice 10.4) — mints a short-lived
// signed URL for a PDF activity's file. PDF assets live in a
// private bucket; the only legitimate read path is a service-role-
// minted signed URL (1-hour TTL, per the 9.3d-b media foundation).
// The link is deliberately NOT stored — minting on demand means a
// leaked link dies within the hour and access is re-checked every
// open.
//
// Access gate: the activity row is read under the STUDENT's own
// RLS. The slice-10.1 nclex_programme_activities_student_select
// policy only exposes activities under a PUBLISHED programme — so
// a readable row IS the permission (permissive v1; tightens with
// enrolment alongside the RLS clause). The asset row itself is
// read via the service-role client because the student never owns
// it — the activity-row gate above is the real check, same shape
// as getAssetUrl's own service-role read.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAssetUrl } from '@/lib/media/queries';
import type { ActivityPayloadPdf } from './types';

export type StudentPdfActivityResult =
  | {
      ok: true;
      original_filename: string;
      size_bytes: number;
      signed_url: string;
    }
  | { ok: false; error: string };

export async function getStudentPdfActivityUrl(
  activityId: string
): Promise<StudentPdfActivityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Access gate — read the activity under the student's own RLS.
  // A missing row means "not a PDF activity the student can see"
  // (doesn't exist, not PUBLISHED, etc.) — all surface the same
  // generic error so a client can't probe for IDs.
  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('type, payload')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity || activity.type !== 'PDF') {
    return { ok: false, error: 'PDF not found or not available.' };
  }

  const assetId = (activity.payload as ActivityPayloadPdf).pdf_asset_id;
  if (!assetId) {
    return {
      ok: false,
      error: 'No PDF has been attached to this activity yet.',
    };
  }

  // Asset metadata for the file row — read via service role: the
  // student doesn't own the asset, so its RLS would hide it. The
  // activity-row gate above is the real access check.
  const service = createServiceRoleClient();
  const { data: asset } = await service
    .from('nclex_media_assets')
    .select('original_filename, size_bytes, status')
    .eq('asset_id', assetId)
    .maybeSingle();
  if (!asset || asset.status !== 'READY') {
    return { ok: false, error: 'This PDF is not available right now.' };
  }

  // Mint the short-lived signed URL via the shared media helper.
  const url = await getAssetUrl(assetId);
  if (!url.ok) return { ok: false, error: url.error };

  return {
    ok: true,
    original_filename: asset.original_filename,
    size_bytes: asset.size_bytes,
    signed_url: url.url,
  };
}

// =====================================================================
// Slice 11.12c — mark a shelf placement "seen"
// =====================================================================
//
// Called when the student OPENS a shelf popup. Records the current
// visible member set as their new "last seen" baseline, clearing the
// "your tutor updated this shelf" drift hint until the membership changes
// again. Self-only by RLS (nclex_library_shelf_seen.student_id =
// auth.uid()); the note-ids come from the client's just-rendered visible
// set — trusting them only affects the student's OWN hint accuracy, never
// anyone else's data, so no server re-resolution is needed.

export async function markShelfSeenAction(
  activityId: string,
  visibleNoteIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const cleanIds = Array.isArray(visibleNoteIds)
    ? visibleNoteIds.filter((x): x is string => typeof x === 'string')
    : [];

  const { error } = await supabase
    .from('nclex_library_shelf_seen')
    .upsert(
      {
        student_id: user.id,
        activity_id: activityId,
        seen_note_ids: cleanIds,
        seen_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,activity_id' }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
