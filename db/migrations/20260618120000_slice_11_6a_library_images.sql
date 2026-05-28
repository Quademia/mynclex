-- =========================================================
-- MyNclex — Slice 11.6a: Library image bucket
-- File: mynclex/db/migrations/20260618120000_slice_11_6a_library_images.sql
-- =========================================================
-- Second consumer of the media-asset foundation (slice 9.3d-b).
-- Provisions the bucket tutor library Image blocks upload into.
-- No new table, no new RLS on nclex_media_assets — those are
-- shared from the foundation. This migration adds only the bucket
-- and its storage.objects INSERT policy.
--
-- Decisions carried from the foundation (media-assets.md):
--   • Bucket per purpose — library images get their own bucket,
--     separate from nclex-pdf-activities (and the future
--     nclex-library-pdfs in slice 11.6b).
--   • Strict MIME allow-list — raster types the browser-side
--     resize helper can re-encode (png / jpeg / webp). GIF is
--     excluded: canvas re-encoding flattens animation, and the
--     differentiator blocks don't need it.
--   • Private bucket, no SELECT policy — reads go through a
--     service-role-minted signed URL (getAssetUrl), gated at the
--     consumer layer first (getLibraryImageUrlAction reads the
--     asset row under RLS before minting).
--
-- Application-side resize keeps most uploads well under the cap,
-- but the bucket cap is the authoritative guard.
--
-- file_size_limit is bytes: 5 * 1024 * 1024 = 5,242,880.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-library-images',
  'nclex-library-images',
  FALSE,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp']
);


-- =========================================================
-- RLS — storage.objects for nclex-library-images
-- =========================================================
-- Authenticated users can INSERT (upload) to this bucket.
-- uploadAssetAction does the application-layer gating; the
-- bucket-level MIME + size caps make a bare upload still safe.
-- No SELECT / UPDATE / DELETE policies — direct reads are denied,
-- the legitimate read path is a service-role signed URL.

CREATE POLICY nclex_library_images_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-library-images');
