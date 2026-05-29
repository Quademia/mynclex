-- =========================================================
-- MyNclex — Slice 11.6b: Library PDF bucket
-- File: mynclex/db/migrations/20260619120000_slice_11_6b_library_pdfs.sql
-- =========================================================
-- Third consumer of the media-asset foundation (slice 9.3d-b),
-- after nclex-pdf-activities (9.3d-c) and nclex-library-images
-- (11.6a). Provisions the bucket tutor library PDF blocks upload
-- into. No new table, no new RLS on nclex_media_assets — those are
-- shared from the foundation. This migration adds only the bucket
-- and its storage.objects INSERT policy.
--
-- Decisions carried from the foundation (media-assets.md):
--   • Bucket per purpose — library PDFs get their own bucket,
--     separate from nclex-pdf-activities (student-activity PDFs)
--     and nclex-library-images.
--   • Strict MIME allow-list — application/pdf only.
--   • Private bucket, no SELECT policy — reads go through a
--     service-role-minted signed URL (getAssetUrl), gated at the
--     consumer layer first (getLibraryPdfUrlAction reads the asset
--     row under RLS before minting). The PDF block mints the URL
--     on click, so the 1-hour expiry never bites a left-open note.
--
-- file_size_limit is bytes: 25 * 1024 * 1024 = 26,214,400. Matches
-- nclex-pdf-activities — library reference PDFs and activity PDFs
-- have the same upper bound.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-library-pdfs',
  'nclex-library-pdfs',
  FALSE,
  26214400,
  ARRAY['application/pdf']
);


-- =========================================================
-- RLS — storage.objects for nclex-library-pdfs
-- =========================================================
-- Authenticated users can INSERT (upload) to this bucket.
-- uploadAssetAction does the application-layer gating; the
-- bucket-level MIME + size caps make a bare upload still safe.
-- No SELECT / UPDATE / DELETE policies — direct reads are denied,
-- the legitimate read path is a service-role signed URL.

CREATE POLICY nclex_library_pdfs_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-library-pdfs');
