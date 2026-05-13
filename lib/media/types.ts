// mynclex/lib/media/types.ts
//
// Shared types + per-purpose configuration map for the media-asset
// foundation. Source of truth — actions.ts and queries.ts both
// read PURPOSE_CONFIG to know which bucket to write to, which MIME
// types to accept, and which size cap to enforce. Adding a new
// purpose later (AVATAR, RATIONALE_IMG, …) is a one-entry edit
// here plus the new bucket in a fresh migration.
//
// Mirrors db/migrations/20260513120000_slice_9_3d_b_media_assets.sql
// (CHECK constraints on media_type, storage_provider, status).

export type MediaType = 'IMAGE' | 'PDF' | 'VIDEO' | 'OTHER';

export type StorageProvider =
  | 'SUPABASE'
  | 'CLOUDFLARE_R2'
  | 'CLOUDFLARE_STREAM'
  | 'EXTERNAL';

export type AssetStatus = 'UPLOADING' | 'READY' | 'DELETED' | 'PURGED';

// Free text in the DB; this union is the canonical TS-side list.
// New consumer features extend this string union and add an entry
// to PURPOSE_CONFIG below.
export type Purpose = 'PDF_ACTIVITY';


// Per-purpose configuration. Drives:
//   • which bucket the file lands in
//   • which MIME types are accepted
//   • the application-level size cap (bucket-level cap is the
//     authoritative one, enforced by Supabase)
//   • whether reads should mint signed URLs or return direct URLs
//
// `storagePathPrefix` is the folder inside the bucket that all
// files for this purpose land in. Server-generated paths take the
// shape `{storagePathPrefix}/{uuid}.{ext}`.

export interface PurposeConfigEntry {
  bucket: string;
  mediaType: MediaType;
  storagePathPrefix: string;
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
  // Public buckets → getAssetUrl returns a direct URL. Private
  // buckets → getAssetUrl mints a 1-hour signed URL via service
  // role. Per media-assets.md §4.4.
  isPublic: boolean;
}

const TWENTY_FIVE_MB = 25 * 1024 * 1024;

export const PURPOSE_CONFIG: Record<Purpose, PurposeConfigEntry> = {
  PDF_ACTIVITY: {
    bucket: 'nclex-pdf-activities',
    mediaType: 'PDF',
    storagePathPrefix: 'pdf_activity',
    allowedMimeTypes: ['application/pdf'],
    maxSizeBytes: TWENTY_FIVE_MB,
    isPublic: false,
  },
};


// Row shape of nclex_media_assets. snake_case columns preserved
// to match the SQL — keeps queries.ts and actions.ts grep-able
// against the migration.

export interface MediaAsset {
  asset_id: string;
  media_type: MediaType;
  purpose: Purpose;
  storage_provider: StorageProvider;
  bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: AssetStatus;
  uploaded_by: string;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
}


// What uploadAssetAction returns to the client.
export type UploadResult =
  | { ok: true; assetId: string; originalFilename: string; sizeBytes: number }
  | { ok: false; error: string };


// What getAssetUrl returns.
export type AssetUrlResult =
  | { ok: true; url: string; isPublic: boolean }
  | { ok: false; error: string };
