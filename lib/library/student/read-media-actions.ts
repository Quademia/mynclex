// mynclex/lib/library/student/read-media-actions.ts
//
// Student-side signed-URL resolution for images / PDFs embedded in a
// note (slice 11.13a). The tutor-side getLibraryImageUrlAction gates on
// asset OWNERSHIP (tutor owns the media row) — a student never owns it,
// so the read view needs its own gate: enrolment-based, not ownership.
//
// The gate, in order:
//   1. RLS-read the note. nclex_student_can_see_note() means a row comes
//      back only if the student is entitled to read this note.
//   2. Confirm the requested assetId is actually referenced by a block
//      of the matching kind in THAT note's body (image action ↔ libImage,
//      pdf action ↔ libPdf). This stops a visible note from being used as
//      an oracle to mint URLs for arbitrary asset ids.
//   3. Only then mint the signed URL via getAssetUrl (service-role,
//      RLS-bypassing) — same minting the tutor side uses.

'use server';

import { createClient } from '@/lib/supabase/server';
import { getAssetUrl } from '@/lib/media/queries';
import type { AssetUrlResult } from '@/lib/media/types';
import { bodyToTiptap } from '../body-tiptap';

// Collect every assetId carried by atom nodes of `nodeType` in the doc.
function collectAssetIds(body: unknown, nodeType: string): Set<string> {
  const ids = new Set<string>();
  const doc = bodyToTiptap(body);
  const walk = (node: {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: unknown;
  }) => {
    if (node.type === nodeType) {
      const id = node.attrs?.assetId;
      if (typeof id === 'string' && id) ids.add(id);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child as { type?: string; attrs?: Record<string, unknown>; content?: unknown });
      }
    }
  };
  walk(doc);
  return ids;
}

async function resolveNoteAssetUrl(
  noteId: string,
  assetId: string,
  nodeType: 'libImage' | 'libPdf',
): Promise<AssetUrlResult> {
  const supabase = await createClient();

  // 1. Entitlement gate — RLS returns the note only if the student can
  //    see it. We pull just the body to verify membership.
  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select('body')
    .eq('note_id', noteId)
    .maybeSingle();

  if (error || !note) {
    return { ok: false, error: 'Not found.' };
  }

  // 2. Membership gate — the asset must belong to this note.
  const ids = collectAssetIds((note as { body: unknown }).body, nodeType);
  if (!ids.has(assetId)) {
    return { ok: false, error: 'Not found.' };
  }

  // 3. Mint.
  return getAssetUrl(assetId);
}

export async function getStudentNoteImageUrlAction(
  noteId: string,
  assetId: string,
): Promise<AssetUrlResult> {
  return resolveNoteAssetUrl(noteId, assetId, 'libImage');
}

export async function getStudentNotePdfUrlAction(
  noteId: string,
  assetId: string,
): Promise<AssetUrlResult> {
  return resolveNoteAssetUrl(noteId, assetId, 'libPdf');
}
