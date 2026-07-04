-- =========================================================
-- MyNclex — Bank rich-content Slice 7: bank image bucket
-- File: mynclex/db/migrations/20260716120000_slice_7_bank_images.sql
-- =========================================================
-- Fourth consumer of the media-asset foundation (slice 9.3d-b).
-- Provisions the bucket the bank image block (chart-tab narrative
-- bodies, later question stems in Slice 8) uploads into. No new
-- table, no new RLS on nclex_media_assets — those are shared from
-- the foundation. This migration adds only the bucket and its
-- storage.objects INSERT policy.
--
-- Decisions (settled with Sam 2026-07-03):
--   • ONE bucket for both sides — admin (QAcademy) bank curators
--     and tutor curators upload into the same bucket. Bucket split
--     adds no security (the bucket is private; every read goes
--     through a gated server action that mints a signed URL), and
--     ownership already lives on the asset row
--     (uploaded_by / owner_user_id). Mirrors the library precedent
--     (one nclex-library-images bucket for all tutors).
--   • Access model = Option A (attempt-anchored student gate):
--     curators resolve via owner-or-bank-curator
--     (getBankImageUrlAction); students resolve via their attempt —
--     the asset must be referenced by that attempt's frozen tab
--     snapshots (getAttemptImageUrlAction, Slice 7c).
--   • Same MIME allow-list + 5 MB cap as the library images bucket:
--     raster types the browser-side resize helper can re-encode
--     (png / jpeg / webp; gif excluded).
--   • Private bucket, no SELECT policy — reads go through a
--     service-role-minted signed URL (getAssetUrl), gated at the
--     consumer layer first.
--
-- file_size_limit is bytes: 5 * 1024 * 1024 = 5,242,880.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-bank-images',
  'nclex-bank-images',
  FALSE,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp']
);


-- =========================================================
-- RLS — storage.objects for nclex-bank-images
-- =========================================================
-- Authenticated users can INSERT (upload) to this bucket.
-- uploadAssetAction does the application-layer gating; the
-- bucket-level MIME + size caps make a bare upload still safe.
-- No SELECT / UPDATE / DELETE policies — direct reads are denied,
-- the legitimate read path is a service-role signed URL.

CREATE POLICY nclex_bank_images_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-bank-images');
