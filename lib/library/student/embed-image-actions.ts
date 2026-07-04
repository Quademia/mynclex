// mynclex/lib/library/student/embed-image-actions.ts
//
// Bank rich-content Slice 8c — STUDENT-side signed-URL resolution for
// bank images inside an EMBEDDED question's stem. The embed player shows
// tutor-question stems inside a library note with no attempt existing,
// so the runner's attempt anchor doesn't apply — the anchor here is the
// NOTE, mirroring the library's own media gate (read-media-actions.ts):
//
//   1. Entitlement gate — RLS-read the note. nclex_student_can_see_note()
//      returns the row only if the student may read this note.
//   2. Anti-oracle gate — the asset must be referenced by the stem of a
//      question this note embeds, from either source the player renders:
//        • LIVE — the stems of every question currently in the note's
//          embedded_questions blocks (service-role read; students can't
//          read nclex_tutor_questions directly — same posture as
//          loadEmbedBlock).
//        • FROZEN — the student's OWN answer-history stem snapshots for
//          this note (RLS self), so a past sitting keeps rendering its
//          image after the tutor edits or removes the question.
//      Stops a readable note being used as a key to mint URLs for
//      arbitrary bank assets.
//   3. Only then mint the 1-hour signed URL.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAssetUrl } from '@/lib/media/queries';
import type { AssetUrlResult } from '@/lib/media/types';
import { collectBankImageAssetIds } from '@/lib/authoring/bank-image-doc';
import { parseRichDoc } from '@/lib/authoring/rich-doc';
import { bodyToTiptap } from '../body-tiptap';

// Every item_id across ALL embedded_questions blocks in the note body
// (embed blocks are top-level doc nodes — same walk as findEmbedBlock in
// embed-player-actions, minus the per-block filter).
function collectEmbeddedItemIds(body: unknown): string[] {
  const doc = bodyToTiptap(body);
  const ids: string[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === 'embedded_questions') {
      const raw = node.attrs?.item_ids;
      if (Array.isArray(raw)) {
        for (const x of raw) if (typeof x === 'string') ids.push(x);
      }
    }
  }
  return ids;
}

export async function getEmbedStemImageUrlAction(
  noteId: string,
  assetId: string,
): Promise<AssetUrlResult> {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  // 1. Entitlement — RLS returns the note only if the student may read it.
  const { data: note, error: noteErr } = await supabase
    .from('nclex_tutor_library_notes')
    .select('body')
    .eq('note_id', noteId)
    .maybeSingle();

  if (noteErr || !note) {
    return { ok: false, error: 'Not found.' };
  }

  // 2. Anti-oracle — collect the asset ids of every stem this note's
  //    embeds can show the student (live questions + own snapshots).
  const itemIds = collectEmbeddedItemIds((note as { body: unknown }).body);

  const admin = createServiceRoleClient();
  const [live, snaps] = await Promise.all([
    itemIds.length > 0
      ? admin
          .from('nclex_tutor_questions')
          .select('stem')
          .in('item_id', itemIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('nclex_library_embed_answers')
      .select('stem_snapshot')
      .eq('note_id', noteId),
  ]);

  if (live.error || snaps.error) {
    return { ok: false, error: 'Could not look up image.' };
  }

  const ids = new Set<string>();
  for (const row of (live.data ?? []) as Array<{ stem: string | null }>) {
    collectBankImageAssetIds(parseRichDoc(row.stem), ids);
  }
  for (const row of (snaps.data ?? []) as Array<{ stem_snapshot: string | null }>) {
    collectBankImageAssetIds(parseRichDoc(row.stem_snapshot), ids);
  }

  if (!ids.has(assetId)) {
    return { ok: false, error: 'Not found.' };
  }

  // 3. Mint.
  return getAssetUrl(assetId);
}
