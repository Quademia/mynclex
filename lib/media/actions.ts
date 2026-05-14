// mynclex/lib/media/actions.ts
//
// Server actions for the media-asset foundation.
//
// uploadAssetAction(file, purpose) is the single entry point for any
// feature that wants to upload a file. It performs application-layer
// MIME + size validation (belt-and-braces — the Supabase bucket also
// enforces both), creates the nclex_media_assets row, pushes the file
// to storage, and flips the row to status=READY on success. Failure
// at any step soft-deletes the row so a partial upload doesn't leave
// a ghost READY row pointing at a non-existent file.
//
// Authorization: runs as the authenticated user. The asset row's
// INSERT policy enforces uploaded_by = auth.uid() AND owner_user_id =
// auth.uid(), and the storage.objects INSERT policy gates the bucket.
// Feature-specific "are you allowed to upload for this purpose?"
// gates live in the consumer slice that wires this action up.

'use server';

import { randomUUID } from 'crypto';

import { createClient } from '@/lib/supabase/server';
import {
  PURPOSE_CONFIG,
  type Purpose,
  type UploadResult,
} from './types';

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

// Map a MIME type to a file extension for the storage_path.
// Keeps the path human-readable in the Supabase dashboard. The
// extension is informational only — the storage layer doesn't act
// on it, and the original_filename column preserves the user's
// version verbatim.
function extensionForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

function buildStoragePath(prefix: string, mime: string): string {
  return `${prefix}/${randomUUID()}.${extensionForMime(mime)}`;
}


// ---------------------------------------------------------
// uploadAssetAction
// ---------------------------------------------------------

export async function uploadAssetAction(
  file: File,
  purpose: Purpose,
): Promise<UploadResult> {
  const config = PURPOSE_CONFIG[purpose];
  if (!config) {
    return { ok: false, error: `Unknown purpose: ${purpose}` };
  }

  // Application-layer validation. Bucket-level rules in Supabase are
  // the authoritative gate — these checks fail fast in the action
  // with a clear error message before we open a connection to
  // storage.
  if (!config.allowedMimeTypes.includes(file.type)) {
    const allowed = config.allowedMimeTypes.join(', ');
    return { ok: false, error: `File type ${file.type} not allowed. Accepted: ${allowed}.` };
  }
  if (file.size > config.maxSizeBytes) {
    const limitMb = Math.round(config.maxSizeBytes / (1024 * 1024));
    return { ok: false, error: `File is too large. Max ${limitMb} MB.` };
  }
  if (file.size === 0) {
    return { ok: false, error: 'File is empty.' };
  }

  const supabase = await createClient();

  // Caller identity. We need both for the insert policy
  // (uploaded_by = auth.uid() AND owner_user_id = auth.uid()) and
  // for a clean "not signed in" error.
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: 'You must be signed in to upload files.' };
  }
  const userId = userData.user.id;

  const storagePath = buildStoragePath(config.storagePathPrefix, file.type);

  // 1. Create the asset row in UPLOADING state. If anything below
  //    fails we flip status to DELETED so the row reflects reality.
  const { data: insertRow, error: insertErr } = await supabase
    .from('nclex_media_assets')
    .insert({
      media_type: config.mediaType,
      purpose,
      storage_provider: 'SUPABASE',
      bucket: config.bucket,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      status: 'UPLOADING',
      uploaded_by: userId,
      owner_user_id: userId,
    })
    .select('asset_id')
    .single();

  if (insertErr || !insertRow) {
    return { ok: false, error: 'Could not create asset record. Please try again.' };
  }
  const assetId = insertRow.asset_id as string;

  // 2. Push the bytes to storage.
  const { error: uploadErr } = await supabase.storage
    .from(config.bucket)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    // Soft-delete the orphan row — sweeper handles the eventual
    // hard-delete per media-assets.md §4.7.
    await supabase
      .from('nclex_media_assets')
      .update({ status: 'DELETED', updated_at: new Date().toISOString() })
      .eq('asset_id', assetId);
    return { ok: false, error: `Upload failed: ${uploadErr.message}` };
  }

  // 3. Flip to READY.
  const { error: readyErr } = await supabase
    .from('nclex_media_assets')
    .update({ status: 'READY', updated_at: new Date().toISOString() })
    .eq('asset_id', assetId);

  if (readyErr) {
    // The file is in storage but the row is still UPLOADING. Soft-
    // delete + report so the caller doesn't proceed thinking the
    // upload is good.
    await supabase
      .from('nclex_media_assets')
      .update({ status: 'DELETED', updated_at: new Date().toISOString() })
      .eq('asset_id', assetId);
    return { ok: false, error: 'Upload completed but record finalisation failed.' };
  }

  return {
    ok: true,
    assetId,
    originalFilename: file.name,
    sizeBytes: file.size,
  };
}
