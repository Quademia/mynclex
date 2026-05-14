-- =========================================================
-- MyNclex — Slice 9.3d-b: Media foundation
-- File: mynclex/db/migrations/20260513120000_slice_9_3d_b_media_assets.sql
-- =========================================================
-- Foundation slice — centralised media-asset system. No feature
-- integration yet. First consumer is PDF activity (slice 9.3d-c);
-- future consumers (avatars, rationale images, videos) each add
-- one Purpose value to the application-layer config map and one
-- new bucket as that feature ships.
--
-- Source of truth for shape + decisions:
--   docs/product-plan/media-assets.md  (settled 2026-05-13)
--
-- Five locked product/architecture decisions confirmed in the
-- slice planning conversation (2026-05-13):
--
--   • Bucket per purpose. This slice provisions the first bucket
--     (nclex-pdf-activities) for tutor-uploaded PDFs only — not
--     a generic "all PDFs" bucket. Library PDFs and QAcademy admin
--     PDFs each get their own bucket when those slices ship.
--
--   • Strict MIME allow-list. application/pdf only for this
--     bucket. Word / PowerPoint deliberately excluded — students
--     read PDFs inline in the browser, .docx rendering drifts
--     across machines, and macros are an attack surface.
--
--   • Owner-narrow RLS on the table. owner_user_id = auth.uid()
--     OR SUPER_ADMIN, for SELECT / UPDATE / DELETE. Cross-feature
--     read access (students viewing PDFs they're enrolled to see)
--     does NOT live on the asset row — it's enforced at the
--     consumer layer (the activity's RLS) and bridged by
--     server-minted signed URLs. Keeps this table single-purpose:
--     it knows nothing about enrolments, cohorts, programmes.
--
--   • Bucket denies direct reads. No SELECT policy on
--     storage.objects for this bucket. The legitimate read path
--     is a service-role-minted signed URL (1-hour expiry).
--
--   • storage_path shape {purpose}/{uuid}.{ext}. Folder-per-purpose
--     keeps the dashboard browsable; UUID kills collisions and
--     prevents PII leaks via filename echo. original_filename
--     preserved separately for display.
--
-- Bucket size cap (25 MB) and MIME allow-list (application/pdf)
-- are enforced by Supabase at the bucket level — oversized or
-- wrong-type uploads are rejected before they touch our code.
-- Application-layer checks in uploadAssetAction are belt-and-
-- braces.


-- =========================================================
-- 1. nclex_media_assets
-- =========================================================
-- One row per uploaded file. The file bytes live in object
-- storage (Supabase Storage for v1, per media-assets.md §4.1);
-- this row is the control record — who uploaded it, who owns it,
-- what it's for, what state it's in, and where the file
-- physically lives. Future migration to Cloudflare R2 / Stream
-- is a row-level data update (storage_provider column), not a
-- schema change.

CREATE TABLE nclex_media_assets (
  asset_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Coarse classification — mostly for filtering/admin views.
  -- The application-level access rules gate on purpose, not
  -- media_type, but media_type lets us answer "how many videos
  -- have we got" without joining anywhere.
  media_type        TEXT NOT NULL
                    CHECK (media_type IN ('IMAGE','PDF','VIDEO','OTHER')),

  -- Fine-grained classification — drives bucket choice, MIME
  -- allow-list, size cap, and public/private behaviour at the
  -- application layer (PURPOSE_CONFIG in lib/media/types.ts).
  -- Free text at the DB level so future purposes (AVATAR,
  -- RATIONALE_IMG, etc.) add as one-line TS edits; the CHECK
  -- constraint would force a migration per new feature for no
  -- security benefit.
  purpose           TEXT NOT NULL,

  -- Where the bytes live. SUPABASE for v1; the column exists so
  -- a future migration of e.g. videos to Cloudflare R2 / Stream
  -- is a data-only update, not a schema change.
  storage_provider  TEXT NOT NULL DEFAULT 'SUPABASE'
                    CHECK (storage_provider IN
                      ('SUPABASE','CLOUDFLARE_R2','CLOUDFLARE_STREAM','EXTERNAL')),

  -- Bucket within the provider. For SUPABASE this is the
  -- storage.buckets.id. Bucket-level rules (size cap, MIME
  -- allow-list, public flag) attach to the bucket, not here.
  bucket            TEXT NOT NULL,

  -- Path within the bucket. Server-generated, UUID-based:
  --   {purpose-lowercased}/{uuid}.{ext}
  -- Never derived from the original filename — prevents
  -- collisions, neutralises path traversal, blocks PII leaks
  -- via URL echo.
  storage_path      TEXT NOT NULL,

  -- What the user saw on their disk. Display-only. Preserved
  -- verbatim so a download link can suggest a sensible filename
  -- without exposing the internal UUID.
  original_filename TEXT NOT NULL,

  -- Reported MIME type. Verified against PURPOSE_CONFIG's
  -- allow-list at upload time and enforced at the Supabase
  -- bucket level as well.
  mime_type         TEXT NOT NULL,

  -- File size in bytes. Verified against PURPOSE_CONFIG cap at
  -- upload time and enforced at the Supabase bucket level.
  size_bytes        BIGINT NOT NULL CHECK (size_bytes >= 0),

  -- Lifecycle. UPLOADING during the upload action; READY once
  -- the file is in storage; DELETED on soft-delete (file
  -- remains in bucket); PURGED once a future sweeper has
  -- removed the file from storage. Sweeper deferred per
  -- media-assets.md §4.7.
  status            TEXT NOT NULL DEFAULT 'UPLOADING'
                    CHECK (status IN ('UPLOADING','READY','DELETED','PURGED')),

  -- Audit trail. Who pressed upload. Immutable, never changes.
  -- ON DELETE RESTRICT preserves audit integrity — a user
  -- account can't be deleted while any asset still attributes
  -- the upload to them. If we ever need to delete a user, the
  -- audit migration handles it explicitly.
  uploaded_by       UUID NOT NULL
                    REFERENCES nclex_users(id) ON DELETE RESTRICT,

  -- Who controls edit/delete. Equal to uploaded_by in the
  -- common case; NULL means platform-owned (e.g. admin
  -- uploading a global asset). Mutable to allow future
  -- ownership transfers.
  -- ON DELETE SET NULL — if the owner's account is deleted,
  -- the asset becomes platform-owned rather than vanishing.
  owner_user_id     UUID
                    REFERENCES nclex_users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- No two asset rows can point at the same physical file.
  -- Defensive — the upload action generates UUIDs, so duplicate
  -- paths shouldn't happen, but the constraint catches any
  -- future bug or manual data fix that would otherwise silently
  -- create a fork.
  UNIQUE (storage_provider, bucket, storage_path)
);


-- Indexes
-- ─────────────────────────────────────────────────────────
-- (owner_user_id, status) — "my live assets" listing for a
--   tutor's eventual "my uploads" view. Status-second so the
--   common case (status = 'READY') is on the leading edge of
--   the index for partial scans.
CREATE INDEX idx_nclex_media_assets_owner_status
  ON nclex_media_assets(owner_user_id, status);

-- (purpose, status) — admin queries like "all PDF_ACTIVITY
--   assets currently READY". Cheap to maintain at this scale.
CREATE INDEX idx_nclex_media_assets_purpose_status
  ON nclex_media_assets(purpose, status);

-- (uploaded_by) — audit queries ("show me everything user X
--   has ever uploaded"). Separate from owner_user_id because
--   the two can diverge after ownership transfer.
CREATE INDEX idx_nclex_media_assets_uploaded_by
  ON nclex_media_assets(uploaded_by);


-- =========================================================
-- 2. RLS — nclex_media_assets
-- =========================================================
-- Narrow, owner-based gates. The table doesn't try to encode
-- "who can see what" for cross-feature consumption (e.g.
-- enrolled students viewing a tutor's PDF) — that access
-- happens via service-role-minted signed URLs after the
-- consumer's own RLS has gated the activity row.

ALTER TABLE nclex_media_assets ENABLE ROW LEVEL SECURITY;


-- Owner can read their own rows. SUPER_ADMIN sees everything.
CREATE POLICY nclex_media_assets_owner_select
  ON nclex_media_assets FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  );

-- Authenticated user can insert a row attributing the upload
-- and ownership to themselves. The application action
-- (uploadAssetAction) is the only intended caller; the policy
-- shape enforces "you can only create assets you own" even if
-- a future caller forgets to set these columns explicitly.
CREATE POLICY nclex_media_assets_self_insert
  ON nclex_media_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND owner_user_id = auth.uid()
  );

-- Owner can update their own rows (e.g. flipping status from
-- UPLOADING to READY, or to DELETED on soft-delete). SUPER_ADMIN
-- bypass for admin tooling later. WITH CHECK pins ownership so
-- an UPDATE can't transfer the row to someone else.
CREATE POLICY nclex_media_assets_owner_update
  ON nclex_media_assets FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  );

-- DELETE here means hard delete (rare — soft-delete via status
-- flip is the normal path). Owner + SUPER_ADMIN only.
CREATE POLICY nclex_media_assets_owner_delete
  ON nclex_media_assets FOR DELETE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR nclex_user_has_role('SUPER_ADMIN')
  );


-- =========================================================
-- 3. Bucket — nclex-pdf-activities
-- =========================================================
-- First bucket. Tutor-uploaded PDFs for curriculum activities
-- only. Private (no public flag), 25 MB cap, application/pdf
-- only. Future PDF purposes (library, admin policy docs)
-- provision their own buckets in their own slices.
--
-- file_size_limit is bytes: 25 * 1024 * 1024 = 26,214,400.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nclex-pdf-activities',
  'nclex-pdf-activities',
  FALSE,
  26214400,
  ARRAY['application/pdf']
);


-- =========================================================
-- 4. RLS — storage.objects for nclex-pdf-activities
-- =========================================================
-- Authenticated users can INSERT (upload) to this bucket. The
-- application-layer uploadAssetAction does additional gating
-- (caller authenticated, asset row created, purpose matches).
-- The bucket-level MIME and size caps make a "bare" upload
-- bypassing our action still safe — it just creates an
-- orphaned object with no asset row, which a future sweeper
-- can prune.
--
-- No SELECT / UPDATE / DELETE policies. With RLS enabled and
-- no permissive policy, direct reads via SDK/REST are denied.
-- The legitimate read path is a service-role-minted signed URL
-- (createSignedUrl) called from server code — signed URLs
-- bypass storage.objects RLS by design and are scoped + short-
-- lived (1 hour).
--
-- Note: storage.objects already has RLS enabled by Supabase
-- platform default. Only new policies are added here.

CREATE POLICY nclex_pdf_activities_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nclex-pdf-activities');
